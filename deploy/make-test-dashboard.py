#!/usr/bin/env python3
"""Build the admin-only test dashboard config from the live dashboards/main.yaml.

Copies the real camera-gallery-card configs (read-only) into views that use
the side-by-side fork element <camera-gallery-card-fork>. Writes JSON for
`lovelace/config/save`. Usage: make-test-dashboard.py /config/dashboards/main.yaml out.json
"""
import copy
import json
import sys

import yaml


class _Loader(yaml.SafeLoader):
    pass


_Loader.add_multi_constructor("!", lambda loader, suffix, node: None)

src, out = sys.argv[1], sys.argv[2]
views = yaml.load(open(src), Loader=_Loader)["views"]
cards = {}
for v in views:
    def walk(o, path=v.get("path")):
        if isinstance(o, dict):
            if o.get("type") == "custom:camera-gallery-card":
                cards[path] = o
            for x in o.values():
                walk(x, path)
        elif isinstance(o, list):
            for x in o:
                walk(x, path)
    walk(v)


def view(title, path, base, element="custom:camera-gallery-card-fork", **extra):
    card = copy.deepcopy(cards[base])
    card["type"] = element
    card.update(extra)
    return {
        "title": title,
        "path": path,
        "type": "sections",
        "max_columns": 1,
        "sections": [{"type": "grid", "cards": [card]}],
    }


config = {
    "title": "CGC fork test",
    "views": [
        view("Front Right · fork", "front-right", "front-right"),
        view("Front Right · fork + scrub", "front-right-scrub", "front-right", scrub_on_drag=True),
        view("Left Front · fork + scrub", "left-front-scrub", "left-front", scrub_on_drag=True),
        view("Doorbell · fork + scrub", "doorbell-scrub", "doorbell", scrub_on_drag=True),
        view("Bedroom · fork + scrub", "bedroom-scrub", "bedroom", scrub_on_drag=True),
        view("Front Right · installed v3.1.0", "front-right-installed", "front-right",
             element="custom:camera-gallery-card"),
    ],
}
json.dump(config, open(out, "w"), indent=1)
print(f"wrote {out}: {len(config['views'])} views")
