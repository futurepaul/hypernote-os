---
hypernote:
  name: Apps
  icon: folder.png
---
Launch any installed app.

```grid.start
columns: 4
gap: 12px
```

```each.start
from: system.apps
as: app
```

```button
appearance: app_tile
icon: {{ app.iconUrl || app.icon }}
text: {{ app.name }}
action: system.switch_app
payload: app.id
```

```each.end
```

```grid.end
```
