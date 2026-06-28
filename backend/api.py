import io
import csv
import json
import uuid
import logging
import time
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import List, Dict, Optional

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

from models import (
    CreateProjectRequest, UpdateProjectRequest,
    LiteratureRequest, ChatRequest, SelectAvenueRequest,
    VariableRequest, ObjectiveRequest,
    InitRequest, AddExperimentsRequest, UpdateExperimentRequest, BulkDeleteRequest,
    SuggestRequest, ResponseSurfaceRequest,
    UpdatePaperSectionRequest,
)
from database import get_client
import sampling
import optimization
import ai


def create_app() -> FastAPI:
    app = FastAPI(title="Optimize Everything V3 API", version="3.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    db = get_client()

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _require(project_id: str) -> Dict:
        res = db.table("projects").select("*").eq("id", project_id).maybe_single().execute()
        if not res.data:
            raise HTTPException(404, "Project not found")
        return res.data

    def _exps(project_id: str) -> List[Dict]:
        res = (
            db.table("experiments")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        )
        return res.data or []

    def _format(p: Dict, exps: List[Dict]) -> Dict:
        objectives = p.get("objectives") or []
        obj_names = [o["name"] for o in objectives]
        variables = p.get("variables") or []

        formatted = []
        for e in exps:
            ov = e.get("objective_values") or {}
            is_complete = bool(obj_names) and all(
                ov.get(n) is not None for n in obj_names
            )
            formatted.append({
                "id": e["id"],
                "variable_values": e.get("variable_values") or {},
                "objective_values": ov,
                "source": e.get("source", "manual"),
                "is_complete": is_complete,
                "created_at": e.get("created_at"),
            })

        complete = [e for e in formatted if e["is_complete"]]

        # Best values per objective
        best_values: Dict = {}
        for obj in objectives:
            vals = [
                float(e["objective_values"][obj["name"]])
                for e in complete
                if e["objective_values"].get(obj["name"]) is not None
            ]
            if vals:
                best = max(vals) if obj["type"] == "maximize" else min(vals)
                idx = next(
                    i + 1
                    for i, e in enumerate(complete)
                    if e["objective_values"].get(obj["name"]) == best
                )
                best_values[obj["name"]] = {
                    "value": best,
                    "experiment_index": idx,
                    "type": obj["type"],
                }

        # Progress series
        progress: Dict = {}
        for obj in objectives:
            vals = [
                float(e["objective_values"][obj["name"]])
                for e in complete
                if e["objective_values"].get(obj["name"]) is not None
            ]
            if vals:
                arr = np.array(vals)
                bsf = (
                    np.maximum.accumulate(arr)
                    if obj["type"] == "maximize"
                    else np.minimum.accumulate(arr)
                )
                progress[obj["name"]] = {
                    "observed": arr.tolist(),
                    "best_so_far": bsf.tolist(),
                }

        # Pareto front (first 2 objectives)
        pareto_data = None
        if len(objectives) >= 2 and len(complete) >= 2:
            o1, o2 = objectives[0], objectives[1]
            n1, n2 = o1["name"], o2["name"]
            x_vals = np.array([float(e["objective_values"][n1]) for e in complete])
            y_vals = np.array([float(e["objective_values"][n2]) for e in complete])
            mat = np.column_stack([
                x_vals if o1["type"] == "maximize" else -x_vals,
                y_vals if o2["type"] == "maximize" else -y_vals,
            ])
            pmask = optimization.pareto_front(mat)
            pareto_data = {
                "x_all": x_vals.tolist(),
                "y_all": y_vals.tolist(),
                "pareto_mask": pmask.tolist(),
                "x_label": f"{n1} ({o1['type']})",
                "y_label": f"{n2} ({o2['type']})",
            }

        return {
            "id": p["id"],
            "name": p.get("name", "Untitled Project"),
            "topic": p.get("topic"),
            "literature_report": p.get("literature_report"),
            "chat_history": p.get("chat_history") or [],
            "selected_avenue": p.get("selected_avenue"),
            "study_design": p.get("study_design"),
            "variables": variables,
            "objectives": objectives,
            "batch_size": p.get("batch_size", 5),
            "experiments": formatted,
            "stats": {
                "total": len(formatted),
                "complete": len(complete),
                "pending": len(formatted) - len(complete),
            },
            "best_values": best_values,
            "progress": progress,
            "pareto": pareto_data,
            "analysis_results": p.get("analysis_results"),
            "paper": p.get("paper"),
            "backend": "BoTorch" if optimization.BOTORCH_AVAILABLE else "scikit-learn GP",
        }

    async def _full(project_id: str) -> Dict:
        return _format(_require(project_id), _exps(project_id))

    # ── Projects ───────────────────────────────────────────────────────────────

    @app.post("/api/projects")
    async def create_project(req: CreateProjectRequest):
        res = db.table("projects").insert({
            "name": req.name or "Untitled Project",
            "topic": req.topic,
            "variables": [],
            "objectives": [],
            "batch_size": 5,
            "chat_history": [],
        }).execute()
        return _format(res.data[0], [])

    @app.get("/api/projects/{project_id}")
    async def get_project(project_id: str):
        return await _full(project_id)

    @app.patch("/api/projects/{project_id}")
    async def update_project(project_id: str, req: UpdateProjectRequest):
        update: Dict = {}
        if req.name is not None:
            update["name"] = req.name
        if req.topic is not None:
            update["topic"] = req.topic
        if req.batch_size is not None:
            update["batch_size"] = req.batch_size
        if update:
            db.table("projects").update(update).eq("id", project_id).execute()
        return await _full(project_id)

    # ── Discovery: literature research ─────────────────────────────────────────

    @app.post("/api/projects/{project_id}/literature")
    async def generate_literature(project_id: str, req: LiteratureRequest):
        p = _require(project_id)
        logger.info(f"Literature research starting for topic: {req.topic[:80]}")
        t0 = time.time()
        try:
            report = ai.literature_research(req.topic)
        except Exception as exc:
            logger.error(f"Literature research failed after {time.time()-t0:.1f}s: {type(exc).__name__}: {exc}")
            raise HTTPException(500, f"Literature research failed: {exc}")
        logger.info(f"Literature research completed in {time.time()-t0:.1f}s")

        project_name = report.get("title") or req.topic[:60] or "Untitled Project"
        db.table("projects").update({
            "topic": req.topic,
            "name": project_name,
            "literature_report": report,
        }).eq("id", project_id).execute()

        return await _full(project_id)

    # ── Discovery: chat (streaming) ────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/chat/stream")
    async def chat_stream(project_id: str, req: ChatRequest):
        p = _require(project_id)
        topic = p.get("topic") or ""
        selected_avenue = p.get("selected_avenue")
        history = p.get("chat_history") or []

        async def event_gen():
            full_response = ""
            async for chunk in ai.chat_stream(topic, selected_avenue, history, req.message):
                if chunk == "data: [DONE]\n\n":
                    # Save completed exchange to DB
                    new_history = list(history) + [
                        {"role": "user", "content": req.message},
                        {"role": "assistant", "content": full_response},
                    ]
                    db.table("projects").update(
                        {"chat_history": new_history}
                    ).eq("id", project_id).execute()
                    yield chunk
                else:
                    # Extract text from SSE payload and accumulate
                    try:
                        payload = json.loads(chunk[6:])
                        full_response += payload.get("text", "")
                    except Exception:
                        pass
                    yield chunk

        return StreamingResponse(
            event_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── Discovery: select avenue ───────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/select-avenue")
    async def select_avenue(project_id: str, req: SelectAvenueRequest):
        p = _require(project_id)
        topic = p.get("topic") or ""
        literature = p.get("literature_report") or {}
        summary = literature.get("summary", "")

        try:
            design = ai.suggest_study_design(topic, req.avenue_name, summary)
        except Exception as exc:
            raise HTTPException(500, f"Study design suggestion failed: {exc}")

        db.table("projects").update({
            "selected_avenue": req.avenue_name,
            "study_design": design,
        }).eq("id", project_id).execute()

        return await _full(project_id)

    # ── Variables ──────────────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/variables")
    async def add_variable(project_id: str, req: VariableRequest):
        p = _require(project_id)
        variables = list(p.get("variables") or [])
        if any(v["name"] == req.name for v in variables):
            raise HTTPException(400, f"Variable '{req.name}' already exists")
        if req.min >= req.max:
            raise HTTPException(400, "min must be less than max")
        variables.append({"name": req.name, "min": req.min, "max": req.max})
        db.table("projects").update({"variables": variables}).eq("id", project_id).execute()
        return await _full(project_id)

    @app.delete("/api/projects/{project_id}/variables/{name}")
    async def remove_variable(project_id: str, name: str):
        p = _require(project_id)
        variables = [v for v in (p.get("variables") or []) if v["name"] != name]
        db.table("projects").update({"variables": variables}).eq("id", project_id).execute()
        return await _full(project_id)

    # ── Objectives ─────────────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/objectives")
    async def add_objective(project_id: str, req: ObjectiveRequest):
        p = _require(project_id)
        objectives = list(p.get("objectives") or [])
        if any(o["name"] == req.name for o in objectives):
            raise HTTPException(400, f"Objective '{req.name}' already exists")
        objectives.append({"name": req.name, "type": req.type})
        db.table("projects").update({"objectives": objectives}).eq("id", project_id).execute()
        return await _full(project_id)

    @app.delete("/api/projects/{project_id}/objectives/{name}")
    async def remove_objective(project_id: str, name: str):
        p = _require(project_id)
        objectives = [o for o in (p.get("objectives") or []) if o["name"] != name]
        db.table("projects").update({"objectives": objectives}).eq("id", project_id).execute()
        return await _full(project_id)

    # ── Init batch ─────────────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/init")
    async def generate_init(project_id: str, req: InitRequest):
        p = _require(project_id)
        variables = p.get("variables") or []
        if not variables:
            raise HTTPException(400, "Define at least one variable first")
        df = sampling.generate(req.n_samples, req.method, variables)
        return {"batch": df.to_dict("records")}

    # ── Experiments ────────────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/experiments")
    async def add_experiments(project_id: str, req: AddExperimentsRequest):
        rows = [
            {
                "project_id": project_id,
                "variable_values": e.variable_values,
                "objective_values": {k: v for k, v in (e.objective_values or {}).items()},
                "source": e.source or "manual",
            }
            for e in req.experiments
        ]
        db.table("experiments").insert(rows).execute()
        return await _full(project_id)

    @app.patch("/api/projects/{project_id}/experiments/{exp_id}")
    async def update_experiment(project_id: str, exp_id: str, req: UpdateExperimentRequest):
        db.table("experiments").update(
            {"objective_values": req.objective_values}
        ).eq("id", exp_id).execute()
        return await _full(project_id)

    @app.delete("/api/projects/{project_id}/experiments/{exp_id}")
    async def delete_experiment(project_id: str, exp_id: str):
        db.table("experiments").delete().eq("id", exp_id).execute()
        return await _full(project_id)

    @app.delete("/api/projects/{project_id}/experiments")
    async def clear_experiments(project_id: str):
        db.table("experiments").delete().eq("project_id", project_id).execute()
        return await _full(project_id)

    @app.post("/api/projects/{project_id}/experiments/bulk-delete")
    async def bulk_delete_experiments(project_id: str, req: BulkDeleteRequest):
        if not req.ids:
            raise HTTPException(400, "No experiment IDs provided")
        for exp_id in req.ids:
            db.table("experiments").delete().eq("id", exp_id).eq("project_id", project_id).execute()
        return await _full(project_id)

    # ── Suggest ────────────────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/suggest")
    async def suggest(project_id: str, req: SuggestRequest):
        p = _require(project_id)
        exps = _exps(project_id)
        variables = p.get("variables") or []
        objectives = p.get("objectives") or []

        if not variables or not objectives:
            raise HTTPException(400, "Variables and objectives must be defined")

        try:
            suggestions = optimization.generate_suggestions(
                exps, variables, objectives,
                req.num_suggestions, req.acq_func, req.beta,
                req.optimization_mode, req.objective_name, req.objective_weights,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"Optimisation failed: {exc}")

        obj_names = [o["name"] for o in objectives]
        rows = [
            {
                "project_id": project_id,
                "variable_values": {v["name"]: s[v["name"]] for v in variables},
                "objective_values": {n: None for n in obj_names},
                "source": "bayesian",
            }
            for s in suggestions
        ]
        db.table("experiments").insert(rows).execute()
        return await _full(project_id)

    # ── Response surface ───────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/response-surface")
    async def response_surface(project_id: str, req: ResponseSurfaceRequest):
        p = _require(project_id)
        exps = _exps(project_id)
        variables = p.get("variables") or []

        if req.mode == "1d":
            var = next((v for v in variables if v["name"] == req.x_var), None)
            if not var:
                raise HTTPException(400, "Variable not found")
            result = optimization.response_surface_1d(exps, var, req.obj_name)
        else:
            vx = next((v for v in variables if v["name"] == req.x_var), None)
            vy = next((v for v in variables if v["name"] == req.y_var), None)
            if not vx or not vy:
                raise HTTPException(400, "Variable not found")
            result = optimization.response_surface_2d(exps, vx, vy, req.obj_name)

        if result is None:
            raise HTTPException(400, "Not enough data for response surface")
        return result

    # ── GP interpretation ──────────────────────────────────────────────────────

    @app.get("/api/projects/{project_id}/gp-interpretation")
    async def get_gp_interpretation(project_id: str):
        p = _require(project_id)
        exps = _exps(project_id)
        variables = p.get("variables") or []
        objectives = p.get("objectives") or []
        if not variables or not objectives:
            raise HTTPException(400, "Variables and objectives must be defined")
        try:
            text = optimization.gp_interpretation(exps, variables, objectives)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"Interpretation failed: {exc}")
        return {"text": text}

    # ── Partial dependence ─────────────────────────────────────────────────────

    @app.get("/api/projects/{project_id}/partial-dependence")
    async def get_partial_dependence(project_id: str):
        p = _require(project_id)
        exps = _exps(project_id)
        variables = p.get("variables") or []
        objectives = p.get("objectives") or []
        if not variables or not objectives:
            raise HTTPException(400, "Variables and objectives must be defined")
        try:
            result = optimization.partial_dependence(exps, variables, objectives)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"Analysis failed: {exc}")
        return {"data": result}

    # ── Parity ─────────────────────────────────────────────────────────────────

    @app.get("/api/projects/{project_id}/parity")
    async def get_parity(project_id: str):
        p = _require(project_id)
        exps = _exps(project_id)
        variables = p.get("variables") or []
        objectives = p.get("objectives") or []
        if not variables or not objectives:
            raise HTTPException(400, "Variables and objectives must be defined")
        try:
            result = optimization.parity_data(exps, variables, objectives)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"Analysis failed: {exc}")
        return {"data": result}

    # ── Analysis: file upload ──────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/analysis/upload")
    async def upload_analysis_file(project_id: str, file: UploadFile = File(...)):
        p = _require(project_id)

        content = await file.read()
        filename = file.filename or "upload"

        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif filename.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise HTTPException(400, "Unsupported file type. Upload CSV or Excel.")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Could not parse file: {exc}")

        # Build summary stats for numeric columns
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        stats: Dict = {}
        for col in numeric_cols:
            s = df[col].dropna()
            stats[col] = {
                "mean": round(float(s.mean()), 4) if len(s) else None,
                "std": round(float(s.std()), 4) if len(s) else None,
                "min": round(float(s.min()), 4) if len(s) else None,
                "max": round(float(s.max()), 4) if len(s) else None,
            }

        preview = df.head(30).where(pd.notna(df), None).values.tolist()
        columns = df.columns.tolist()

        # Claude analysis
        topic = p.get("topic") or ""
        avenue = p.get("selected_avenue") or ""
        try:
            analysis_text = ai.analyze_uploaded_data(topic, avenue, columns, stats, len(df))
        except Exception:
            analysis_text = ""

        file_entry = {
            "id": str(uuid.uuid4()),
            "filename": filename,
            "n_rows": len(df),
            "columns": columns,
            "preview": preview,
            "stats": stats,
            "analysis": analysis_text,
        }

        existing = p.get("analysis_results") or {"files": []}
        existing.setdefault("files", [])
        existing["files"].append(file_entry)

        db.table("projects").update(
            {"analysis_results": existing}
        ).eq("id", project_id).execute()

        return await _full(project_id)

    @app.delete("/api/projects/{project_id}/analysis/files/{file_id}")
    async def delete_analysis_file(project_id: str, file_id: str):
        p = _require(project_id)
        results = p.get("analysis_results") or {"files": []}
        results["files"] = [f for f in results.get("files", []) if f["id"] != file_id]
        db.table("projects").update(
            {"analysis_results": results}
        ).eq("id", project_id).execute()
        return await _full(project_id)

    # ── Paper generation ───────────────────────────────────────────────────────

    @app.post("/api/projects/{project_id}/paper/generate")
    async def generate_paper(project_id: str):
        p = _require(project_id)
        exps = _exps(project_id)

        variables = p.get("variables") or []
        objectives = p.get("objectives") or []
        topic = p.get("topic") or ""
        avenue = p.get("selected_avenue") or ""
        literature = p.get("literature_report") or {}
        lit_summary = literature.get("summary", "")

        # Build best_values
        formatted = []
        for e in exps:
            ov = e.get("objective_values") or {}
            obj_names = [o["name"] for o in objectives]
            is_complete = bool(obj_names) and all(ov.get(n) is not None for n in obj_names)
            formatted.append({**e, "is_complete": is_complete})

        complete = [e for e in formatted if e["is_complete"]]
        best_values: Dict = {}
        for obj in objectives:
            vals = [float(e["objective_values"][obj["name"]]) for e in complete
                    if e["objective_values"].get(obj["name"]) is not None]
            if vals:
                best = max(vals) if obj["type"] == "maximize" else min(vals)
                idx = next(i + 1 for i, e in enumerate(complete)
                           if e["objective_values"].get(obj["name"]) == best)
                best_values[obj["name"]] = {"value": best, "experiment_index": idx}

        try:
            paper = ai.generate_paper(
                topic, avenue, variables, objectives,
                formatted, best_values, lit_summary,
            )
        except Exception as exc:
            raise HTTPException(500, f"Paper generation failed: {exc}")

        db.table("projects").update({"paper": paper}).eq("id", project_id).execute()
        return await _full(project_id)

    @app.patch("/api/projects/{project_id}/paper")
    async def update_paper_section(project_id: str, req: UpdatePaperSectionRequest):
        p = _require(project_id)
        paper = dict(p.get("paper") or {})
        paper[req.section] = req.content
        db.table("projects").update({"paper": paper}).eq("id", project_id).execute()
        return await _full(project_id)

    # ── Export ─────────────────────────────────────────────────────────────────

    @app.get("/api/projects/{project_id}/export/csv")
    async def export_csv(project_id: str):
        p = _require(project_id)
        exps = _exps(project_id)
        variables = p.get("variables") or []
        objectives = p.get("objectives") or []

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["experiment"]
            + [v["name"] for v in variables]
            + [o["name"] for o in objectives]
            + ["source"]
        )
        for i, e in enumerate(exps, 1):
            writer.writerow(
                [i]
                + [e["variable_values"].get(v["name"], "") for v in variables]
                + [e["objective_values"].get(o["name"], "") for o in objectives]
                + [e.get("source", "")]
            )
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=experiments.csv"},
        )

    # ── Health ─────────────────────────────────────────────────────────────────

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "version": "3.0",
            "backend": "BoTorch" if optimization.BOTORCH_AVAILABLE else "scikit-learn GP",
        }

    return app
