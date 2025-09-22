---
hypernote:
  name: Poast
  icon: mail.png
actions:
  post_note:
    after:
      clear:
        - editor
    content: "{{ form.editor }}"
    kind: 1
    tags:
      - - client
        - hypernote-client
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
