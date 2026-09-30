import os

# Tests must be deterministic and never call the network: default the sentinel to regex.
os.environ["KP_EXTRACTOR"] = "regex"
