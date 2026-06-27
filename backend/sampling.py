import numpy as np
import pandas as pd
from typing import List, Dict
from scipy.stats.qmc import Sobol, LatinHypercube, scale as qmc_scale


def generate(n_samples: int, method: str, variables: List[Dict]) -> pd.DataFrame:
    n_vars = len(variables)
    l_bounds = np.array([v["min"] for v in variables])
    u_bounds = np.array([v["max"] for v in variables])

    if method == "Sobol":
        sampler = Sobol(d=n_vars, scramble=True)
        unit = sampler.random(n_samples)
    elif method == "Latin Hypercube":
        sampler = LatinHypercube(d=n_vars)
        unit = sampler.random(n_samples)
    else:
        rng = np.random.default_rng()
        unit = rng.uniform(0, 1, (n_samples, n_vars))

    scaled = qmc_scale(unit, l_bounds, u_bounds)
    return pd.DataFrame(scaled, columns=[v["name"] for v in variables])
