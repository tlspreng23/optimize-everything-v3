import modal

app = modal.App("optimize-everything-v3-api")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi[standard]>=0.104",
        "supabase>=2.3",
        "numpy>=1.24",
        "pandas>=2.0",
        "scikit-learn>=1.3",
        "scipy>=1.10",
        "python-multipart",
        "anthropic>=0.25",
        "openpyxl>=3.1",
        "xlrd>=2.0",
    )
    .pip_install(
        "torch",
        extra_options="--index-url https://download.pytorch.org/whl/cpu",
    )
    .pip_install("gpytorch>=1.11", "botorch>=0.9")
    .add_local_dir(".", remote_path="/root")
)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("optimize-everything-secrets"),
        modal.Secret.from_name("optimize-everything-key"),
    ],
    timeout=300,
    scaledown_window=300,
    min_containers=1,
)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def fastapi_app():
    from api import create_app
    return create_app()
