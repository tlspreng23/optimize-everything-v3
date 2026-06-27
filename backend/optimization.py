import numpy as np
from typing import List, Dict, Optional
from scipy.stats import norm as scipy_norm
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import Matern, WhiteKernel, ConstantKernel

try:
    import torch
    from botorch.models import SingleTaskGP
    from botorch.fit import fit_gpytorch_mll
    from botorch.acquisition import ExpectedImprovement, UpperConfidenceBound
    from botorch.acquisition.monte_carlo import qExpectedImprovement, qUpperConfidenceBound
    from botorch.optim import optimize_acqf
    from gpytorch.mlls import ExactMarginalLogLikelihood
    try:
        from botorch.sampling.normal import SobolQMCNormalSampler
    except ImportError:
        from botorch.sampling.samplers import SobolQMCNormalSampler
    BOTORCH_AVAILABLE = True
except ImportError:
    BOTORCH_AVAILABLE = False


# ── Internal helpers ───────────────────────────────────────────────────────────

def _complete(experiments: List[Dict], obj_names: List[str]) -> List[Dict]:
    return [
        e for e in experiments
        if all(e.get("objective_values", {}).get(n) is not None for n in obj_names)
    ]


def _build_X(experiments: List[Dict], variables: List[Dict]) -> np.ndarray:
    X = np.array(
        [[e["variable_values"][v["name"]] for v in variables] for e in experiments],
        dtype=float,
    )
    for i, var in enumerate(variables):
        lo, hi = var["min"], var["max"]
        X[:, i] = (X[:, i] - lo) / (hi - lo + 1e-10)
    return X


def _build_y(
    experiments: List[Dict],
    objectives: List[Dict],
    mode: str,
    target_obj: Optional[str],
    weights: Optional[Dict],
) -> np.ndarray:
    if mode == "Single Objective":
        obj = next(o for o in objectives if o["name"] == target_obj)
        y = np.array(
            [float(e["objective_values"][target_obj]) for e in experiments], dtype=float
        )
        if obj["type"] == "minimize":
            y = -y

    elif mode == "Weighted Sum":
        y = np.zeros(len(experiments))
        for obj in objectives:
            vals = np.array(
                [float(e["objective_values"][obj["name"]]) for e in experiments]
            )
            w = (weights or {}).get(obj["name"], 1.0 / len(objectives))
            rng_v = vals.max() - vals.min()
            norm_vals = (vals - vals.min()) / (rng_v + 1e-10)
            if obj["type"] == "minimize":
                norm_vals = 1.0 - norm_vals
            y += w * norm_vals

    else:  # Pareto / hypervolume improvement
        obj_names = [o["name"] for o in objectives]
        mat = np.array(
            [[float(e["objective_values"][n]) for n in obj_names] for e in experiments],
            dtype=float,
        )
        for i, obj in enumerate(objectives):
            if obj["type"] == "minimize":
                mat[:, i] = -mat[:, i]
        ref = np.min(mat, axis=0) - 0.1 * np.abs(np.min(mat, axis=0))
        y = _hypervolume_improvement(mat, ref)

    mu, sigma = y.mean(), y.std()
    return (y - mu) / (sigma + 1e-10)


def pareto_front(mat: np.ndarray) -> np.ndarray:
    n = mat.shape[0]
    mask = np.ones(n, dtype=bool)
    for i in range(n):
        if not mask[i]:
            continue
        others = mat[mask]
        dominated = np.all(others >= mat[i], axis=1) & np.any(others > mat[i], axis=1)
        if np.any(dominated):
            mask[i] = False
        else:
            dom_by_i = np.all(mat[i] >= mat, axis=1) & np.any(mat[i] > mat, axis=1)
            mask &= ~dom_by_i
            mask[i] = True
    return mask


def _calc_hypervolume(points: np.ndarray, ref: np.ndarray) -> float:
    if len(points) == 0:
        return 0.0
    if points.shape[1] == 2:
        sorted_pts = points[np.argsort(points[:, 0])]
        vol, prev_x = 0.0, ref[0]
        for pt in sorted_pts:
            if pt[0] > prev_x:
                vol += (pt[0] - prev_x) * max(0.0, pt[1] - ref[1])
                prev_x = pt[0]
        return vol
    return float(sum(np.prod(np.maximum(0, pt - ref)) for pt in points))


def _hypervolume_improvement(mat: np.ndarray, ref: np.ndarray) -> np.ndarray:
    full_hv = _calc_hypervolume(mat, ref)
    hvi = np.zeros(len(mat))
    for i in range(len(mat)):
        other = np.delete(mat, i, axis=0)
        hvi[i] = full_hv - _calc_hypervolume(other, ref)
    return hvi


def _fit_sklearn(X: np.ndarray, y: np.ndarray) -> GaussianProcessRegressor:
    n_dims = X.shape[1]
    kernel = (
        ConstantKernel(1.0, constant_value_bounds=(1e-3, 10.0))
        * Matern(length_scale=np.ones(n_dims) * 0.3, nu=2.5, length_scale_bounds=(1e-3, 10.0))
        + WhiteKernel(noise_level=1e-4, noise_level_bounds=(1e-8, 0.1))
    )
    gp = GaussianProcessRegressor(
        kernel=kernel, alpha=1e-6, normalize_y=False, n_restarts_optimizer=10
    )
    gp.fit(X, y)
    return gp


# ── Suggestion generation ──────────────────────────────────────────────────────

def _suggest_sklearn(
    X: np.ndarray, y: np.ndarray, variables: List[Dict], num: int, acq_func: str, beta: float
) -> List[Dict]:
    gp = _fit_sklearn(X, y)
    rng = np.random.default_rng()
    cands = rng.uniform(0, 1, (2000, len(variables)))
    mean, std = gp.predict(cands, return_std=True)

    if acq_func == "Expected Improvement":
        best_f = float(np.max(y))
        z = (mean - best_f) / (std + 1e-9)
        acq = (mean - best_f) * scipy_norm.cdf(z) + std * scipy_norm.pdf(z)
    else:
        acq = mean + beta * std

    top = np.argsort(acq)[-num:][::-1]
    results = []
    for idx in top:
        s = {}
        for j, var in enumerate(variables):
            lo, hi = var["min"], var["max"]
            s[var["name"]] = float(np.clip(cands[idx, j] * (hi - lo) + lo, lo, hi))
        s["acquisition_value"] = float(acq[idx])
        results.append(s)
    return results


def _suggest_botorch(
    X: np.ndarray, y: np.ndarray, variables: List[Dict], num: int, acq_func: str, beta: float
) -> List[Dict]:
    X_t = torch.tensor(X, dtype=torch.float64)
    y_t = torch.tensor(y.reshape(-1, 1), dtype=torch.float64)
    bounds = torch.zeros(2, len(variables), dtype=torch.float64)
    bounds[1] = 1.0

    model = SingleTaskGP(X_t, y_t)
    mll = ExactMarginalLogLikelihood(model.likelihood, model)
    fit_gpytorch_mll(mll)

    sampler = SobolQMCNormalSampler(sample_shape=torch.Size([512]))

    if acq_func == "Expected Improvement":
        acq_fn = ExpectedImprovement(model, best_f=y_t.max()) if num == 1 else \
                 qExpectedImprovement(model, best_f=y_t.max(), sampler=sampler)
    else:
        acq_fn = UpperConfidenceBound(model, beta=beta) if num == 1 else \
                 qUpperConfidenceBound(model, beta=beta, sampler=sampler)

    candidates, acq_vals = optimize_acqf(
        acq_fn, bounds=bounds, q=num, num_restarts=20, raw_samples=512
    )
    joint_acq = float(acq_vals.item() if acq_vals.numel() == 1 else acq_vals.mean().item())

    results = []
    for i in range(num):
        s = {}
        for j, var in enumerate(variables):
            lo, hi = var["min"], var["max"]
            s[var["name"]] = float(
                np.clip(candidates[i, j].item() * (hi - lo) + lo, lo, hi)
            )
        s["acquisition_value"] = joint_acq
        results.append(s)
    return results


def generate_suggestions(
    experiments: List[Dict],
    variables: List[Dict],
    objectives: List[Dict],
    num: int,
    acq_func: str,
    beta: Optional[float],
    mode: str,
    target_obj: Optional[str],
    weights: Optional[Dict],
) -> List[Dict]:
    obj_names = [o["name"] for o in objectives]
    done = _complete(experiments, obj_names)
    if len(done) < 2:
        raise ValueError("Need at least 2 completed experiments to run optimisation.")

    X = _build_X(done, variables)
    y = _build_y(done, objectives, mode, target_obj, weights)
    b = beta or 2.0

    if BOTORCH_AVAILABLE:
        return _suggest_botorch(X, y, variables, num, acq_func, b)
    return _suggest_sklearn(X, y, variables, num, acq_func, b)


# ── Partial dependence ─────────────────────────────────────────────────────────

def partial_dependence(
    experiments: List[Dict],
    variables: List[Dict],
    objectives: List[Dict],
) -> List[Dict]:
    results = []
    for obj in objectives:
        oname = obj["name"]
        obj_plots = []
        for var in variables:
            plot = response_surface_1d(experiments, var, oname)
            if plot:
                obj_plots.append({
                    "variable": var["name"],
                    "x_plot": plot["x_plot"],
                    "mean": plot["mean"],
                    "lower": plot["lower"],
                    "upper": plot["upper"],
                    "x_data": plot["x_data"],
                    "y_data": plot["y_data"],
                })
        results.append({"objective": oname, "plots": obj_plots})
    return results


# ── Parity (LOO) ──────────────────────────────────────────────────────────────

def parity_data(
    experiments: List[Dict],
    variables: List[Dict],
    objectives: List[Dict],
) -> List[Dict]:
    obj_names = [o["name"] for o in objectives]
    done = _complete(experiments, obj_names)
    if len(done) < 3:
        raise ValueError("Need at least 3 completed experiments for LOO analysis.")

    X = _build_X(done, variables)
    n = len(X)

    results = []
    for obj in objectives:
        oname = obj["name"]
        y_raw = np.array([float(e["objective_values"][oname]) for e in done], dtype=float)
        y_mu, y_sig = y_raw.mean(), y_raw.std() + 1e-10
        y_std = (y_raw - y_mu) / y_sig

        gp_full = _fit_sklearn(X, y_std)
        fitted_kernel = gp_full.kernel_

        loo_mu = np.zeros(n)
        loo_sig = np.zeros(n)
        for i in range(n):
            X_train = np.delete(X, i, axis=0)
            y_train = np.delete(y_std, i)
            gp_loo = GaussianProcessRegressor(
                kernel=fitted_kernel,
                alpha=1e-6,
                normalize_y=False,
                optimizer=None,
            )
            gp_loo.fit(X_train, y_train)
            mu_i, sig_i = gp_loo.predict(X[i: i + 1], return_std=True)
            loo_mu[i] = mu_i[0]
            loo_sig[i] = sig_i[0]

        predicted = loo_mu * y_sig + y_mu
        pred_std = np.maximum(loo_sig * y_sig, 1e-10)
        residuals = (y_raw - predicted) / pred_std

        results.append({
            "objective": oname,
            "actual": y_raw.tolist(),
            "predicted": predicted.tolist(),
            "pred_std": pred_std.tolist(),
            "residuals": residuals.tolist(),
        })

    return results


# ── GP interpretation ──────────────────────────────────────────────────────────

def gp_interpretation(
    experiments: List[Dict],
    variables: List[Dict],
    objectives: List[Dict],
) -> str:
    from ai import gp_interpretation as ai_interpret

    obj_names = [o["name"] for o in objectives]
    done = _complete(experiments, obj_names)
    if len(done) < 2:
        raise ValueError("Need at least 2 completed experiments.")

    X = _build_X(done, variables)

    obj_blocks = []
    for obj in objectives:
        oname = obj["name"]
        y_raw = np.array([float(e["objective_values"][oname]) for e in done], dtype=float)
        y_mu, y_sig = y_raw.mean(), y_raw.std() + 1e-10
        y_std = (y_raw - y_mu) / y_sig

        gp = _fit_sklearn(X, y_std)
        kernel = gp.kernel_

        try:
            amplitude = float(kernel.k1.k1.constant_value)
            length_scales = np.atleast_1d(kernel.k1.k2.length_scale)
            noise = float(kernel.k2.noise_level)
        except AttributeError:
            length_scales = np.ones(len(variables))
            amplitude, noise = 1.0, 0.0

        inv_ls = 1.0 / (length_scales + 1e-10)
        rel_sens = inv_ls / inv_ls.max()

        directions = []
        for i in range(len(variables)):
            grid = np.linspace(0, 1, 50)
            X_grid = np.tile(X.mean(axis=0), (50, 1))
            X_grid[:, i] = grid
            mu_s, _ = gp.predict(X_grid, return_std=True)
            delta = float(mu_s[-1] - mu_s[0])
            if abs(delta) < 0.05:
                directions.append("no clear trend")
            elif delta > 0:
                directions.append("increasing")
            else:
                directions.append("decreasing")

        noise_to_signal = noise / (amplitude + 1e-10)
        ranked = np.argsort(length_scales)

        lines = [f"Objective: {oname} ({obj['type']})"]
        lines.append(f"  n = {len(done)} observations")
        lines.append(
            f"  Signal amplitude: {amplitude:.3f}  |  Noise: {noise:.4f}  |  "
            f"Noise/signal: {noise_to_signal:.1%}"
        )
        lines.append("  Variables (sorted most → least sensitive):")
        for rank, i in enumerate(ranked, 1):
            var = variables[i]
            lines.append(
                f"    {rank}. {var['name']} [range {var['min']}–{var['max']}]  "
                f"LS={length_scales[i]:.3f}  rel.sens={rel_sens[i]:.2f}  "
                f"direction: {directions[i]}"
            )
        obj_blocks.append("\n".join(lines))

    stats_text = "\n\n".join(obj_blocks)
    return ai_interpret(stats_text)


# ── Response surfaces ──────────────────────────────────────────────────────────

def response_surface_1d(
    experiments: List[Dict], var: Dict, obj_name: str
) -> Optional[Dict]:
    done = [
        e for e in experiments
        if e.get("objective_values", {}).get(obj_name) is not None
    ]
    if len(done) < 2:
        return None

    lo, hi = var["min"], var["max"]
    X_raw = np.array([e["variable_values"][var["name"]] for e in done], dtype=float)
    y_raw = np.array([float(e["objective_values"][obj_name]) for e in done], dtype=float)
    X_norm = ((X_raw - lo) / (hi - lo + 1e-10)).reshape(-1, 1)

    y_mu, y_sig = y_raw.mean(), y_raw.std() + 1e-10
    y_std = (y_raw - y_mu) / y_sig

    gp = _fit_sklearn(X_norm, y_std)
    grid = np.linspace(0, 1, 200).reshape(-1, 1)
    mu_s, sig_s = gp.predict(grid, return_std=True)

    mu = mu_s * y_sig + y_mu
    sig = sig_s * y_sig
    x_plot = grid.flatten() * (hi - lo) + lo

    return {
        "x_plot": x_plot.tolist(),
        "mean": mu.tolist(),
        "lower": (mu - 2 * sig).tolist(),
        "upper": (mu + 2 * sig).tolist(),
        "x_data": X_raw.tolist(),
        "y_data": y_raw.tolist(),
    }


def response_surface_2d(
    experiments: List[Dict], var_x: Dict, var_y: Dict, obj_name: str
) -> Optional[Dict]:
    done = [
        e for e in experiments
        if e.get("objective_values", {}).get(obj_name) is not None
    ]
    if len(done) < 3:
        return None

    xn, yn = var_x["name"], var_y["name"]
    x_raw = np.array([e["variable_values"][xn] for e in done], dtype=float)
    y_raw = np.array([e["variable_values"][yn] for e in done], dtype=float)
    z_raw = np.array([float(e["objective_values"][obj_name]) for e in done], dtype=float)

    X_norm = np.column_stack([
        (x_raw - var_x["min"]) / (var_x["max"] - var_x["min"] + 1e-10),
        (y_raw - var_y["min"]) / (var_y["max"] - var_y["min"] + 1e-10),
    ])
    z_mu, z_sig = z_raw.mean(), z_raw.std() + 1e-10
    z_std = (z_raw - z_mu) / z_sig

    try:
        gp = _fit_sklearn(X_norm, z_std)
    except Exception:
        return None

    n = 35
    xi = np.linspace(var_x["min"], var_x["max"], n)
    yi = np.linspace(var_y["min"], var_y["max"], n)
    Xi, Yi = np.meshgrid(xi, yi)
    Xg = np.column_stack([
        (Xi.ravel() - var_x["min"]) / (var_x["max"] - var_x["min"] + 1e-10),
        (Yi.ravel() - var_y["min"]) / (var_y["max"] - var_y["min"] + 1e-10),
    ])
    Zi = (gp.predict(Xg) * z_sig + z_mu).reshape(n, n)

    return {
        "x_axis": xi.tolist(),
        "y_axis": yi.tolist(),
        "z_grid": Zi.tolist(),
        "x_data": x_raw.tolist(),
        "y_data": y_raw.tolist(),
        "z_data": z_raw.tolist(),
    }
