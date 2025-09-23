---
hypernote:
  name: Apps
  icon: folder.png
---
Launch any installed app.

```hstack.start
wrap: true
gap: 12px
align: flex-end
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

```hstack.end
```
