#!/usr/bin/env python3
"""
Query connector-index.json for specific connectors by key.
Agents call this after system inference to load only the detected systems' full entries.

Usage:
  python3 standards/query-connector.py salesforce netsuite shopify
  python3 standards/query-connector.py --list-names          # print all display names + keys
  python3 standards/query-connector.py --category erp_finance # all connectors in a category
"""
import json, sys, os

INDEX_PATH = os.path.join(os.path.dirname(__file__), "connector-index.json")

def load_index():
    with open(INDEX_PATH) as f:
        return json.load(f)

def find_connector(index, key):
    for cat_key, cat_val in index["categories"].items():
        if key in cat_val.get("connectors", {}):
            entry = dict(cat_val["connectors"][key])
            entry["_category"] = cat_key
            return entry
    return None

def list_names(index):
    rows = []
    for cat_key, cat_val in index["categories"].items():
        for conn_key, conn_val in cat_val.get("connectors", {}).items():
            rows.append(f"{conn_key:<40} {conn_val.get('displayName','')}")
    return sorted(rows)

def list_category(index, cat_key):
    cat = index["categories"].get(cat_key)
    if not cat:
        return {}
    return {k: v for k, v in cat["connectors"].items()}

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print("Usage: python3 standards/query-connector.py <key> [<key> ...]")
        print("       python3 standards/query-connector.py --list-names")
        print("       python3 standards/query-connector.py --category <cat>")
        sys.exit(1)

    index = load_index()

    if args[0] == "--list-names":
        print("\n".join(list_names(index)))
    elif args[0] == "--category" and len(args) > 1:
        result = list_category(index, args[1])
        print(json.dumps(result, indent=2))
    else:
        results = {}
        for key in args:
            entry = find_connector(index, key)
            if entry:
                results[key] = entry
            else:
                results[key] = {"error": f"Not found in connector-index.json — check connector-names.json for valid keys"}
        print(json.dumps(results, indent=2))
