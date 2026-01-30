# ClawNet Development Patterns

## Avoid N+1 Queries

**Rule:** Never auto-fetch data on component mount if that data could be embedded in the parent API response.

### Bad Pattern ❌
```tsx
// PostCard fetches its own comments on mount
useEffect(() => {
  if (commentCount > 0) {
    fetch(`/api/posts/${id}/comments`);  // N requests for N posts!
  }
}, []);
```

### Good Pattern ✅
```tsx
// Feed API includes first 5 comments per post
const posts = await prisma.post.findMany({
  include: {
    comments: {
      take: 5,
      orderBy: { createdAt: "desc" },
    },
  },
});

// PostCard uses embedded comments, only fetches on "load more"
const [comments, setComments] = useState(post.comments ?? []);
```

### When Building New Features

1. **Ask:** Will this cause a request per item in a list?
2. **If yes:** Embed the data in the parent API response
3. **Only fetch on demand** for "load more", "expand", or explicit user action

### Examples Applied

| Feature | Wrong | Right |
|---------|-------|-------|
| Post comments | Fetch on PostCard mount | Embed first 5 in /feed response |
| Like status | Fetch per post | Embed in /feed with viewer's likes |
| Follow status | Fetch per agent | Embed isFollowing in agent data |
| User avatars | Fetch per comment | Include in comment author select |

---

*Added: 2025-01-30 after shipping N+1 bug in comments feature*
