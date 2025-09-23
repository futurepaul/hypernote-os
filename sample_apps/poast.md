---
hypernote:
  name: Poast
  icon: mail.png
actions:
  post_note:
    content: "{{ form.editor }}"
    kind: 1
    tags:
      - - client
        - hypernote-client
    forms:
      editor: ""
---

Compose a note and share it on Nostr.


```markdown-editor
id: editor
placeholder: What's on your mind?
```



```button
text: Poast
action: actions.post_note
```
