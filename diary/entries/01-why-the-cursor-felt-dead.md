The first version of FaceyBuk shipped a single shared interface — same buttons, same layout, whether you were the parent reading or the child listening. Technically correct. Emotionally flat. The child stared at a row of controls they'd never touch; the parent squinted at cartoon avatars sized for a five-year-old. It read as "video call with a story bolted on," not "a room you're both in."

The fix wasn't better styling — it was *role*. The same story object now renders two entirely different affordances: the parent gets a control surface (line queue, pace, who speaks next), the child gets an engagement surface (characters that animate and voice their own lines via the Web Speech API). Same data, two intents.

```js
// render by intent, not by route
const role = localStorage.getItem('role');
const view = role === 'parent' ? ControlView : StoryView;
view(story.at(cursor)).mount();
```

### WHAT I'D STILL CHANGE

- The role lives in `localStorage` — refresh on the wrong tab and you're suddenly the child mid-story. It should be derived from the room handshake.
- The child's view has no way to signal "slow down" back to the parent. Engagement without feedback is still one-directional.
- Character avatars should react to the parent's audio amplitude — if Dad gets loud, the bear should flinch.
