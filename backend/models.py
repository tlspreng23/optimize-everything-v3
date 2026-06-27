from pydantic import BaseModel
from typing import Optional, Dict, List, Literal


# ── Project ───────────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: Optional[str] = None
    topic: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    topic: Optional[str] = None
    batch_size: Optional[int] = None


# ── Discovery / Chat ──────────────────────────────────────────────────────────

class LiteratureRequest(BaseModel):
    topic: str


class ChatRequest(BaseModel):
    message: str


class SelectAvenueRequest(BaseModel):
    avenue_id: str
    avenue_name: str


# ── Study Architecture ────────────────────────────────────────────────────────

class VariableRequest(BaseModel):
    name: str
    min: float
    max: float


class ObjectiveRequest(BaseModel):
    name: str
    type: Literal["maximize", "minimize"]


# ── Experiments ───────────────────────────────────────────────────────────────

class InitRequest(BaseModel):
    n_samples: int = 10
    method: Literal["Latin Hypercube", "Sobol", "Random"] = "Latin Hypercube"


class ExperimentItem(BaseModel):
    variable_values: Dict[str, float]
    objective_values: Optional[Dict[str, Optional[float]]] = None
    source: Optional[str] = "manual"


class AddExperimentsRequest(BaseModel):
    experiments: List[ExperimentItem]


class UpdateExperimentRequest(BaseModel):
    objective_values: Dict[str, Optional[float]]


class BulkDeleteRequest(BaseModel):
    ids: List[str]


# ── Optimisation ──────────────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    num_suggestions: int = 5
    acq_func: str = "Expected Improvement"
    beta: Optional[float] = None
    optimization_mode: str = "Single Objective"
    objective_name: Optional[str] = None
    objective_weights: Optional[Dict[str, float]] = None


class ResponseSurfaceRequest(BaseModel):
    mode: Literal["1d", "2d"] = "1d"
    obj_name: str
    x_var: str
    y_var: Optional[str] = None


# ── Paper ─────────────────────────────────────────────────────────────────────

class UpdatePaperSectionRequest(BaseModel):
    section: Literal["title", "abstract", "introduction", "results", "discussion", "conclusion"]
    content: str
