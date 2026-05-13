import importlib.util
import os
import sys


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
BACKEND_ENTRY = os.path.join(BACKEND_DIR, "api", "index.py")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

spec = importlib.util.spec_from_file_location("backend_api_entry", BACKEND_ENTRY)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

app = module.app
