---
hypernote:
  name: JSON Viewer
  icon: search.png
  handles:
    - label: Inspect JSON
      forms:
        payload: payload.value
forms:
  payload: ""
---
Paste JSON below or launch this app with a payload to inspect it instantly.

```input
name: payload
text: Paste JSON here...
```

```json.viewer
label: Parsed Input
source: form.payload
```
