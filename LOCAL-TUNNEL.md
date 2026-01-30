# Localtunnel Alternatives Research

## Current Situation

Ralph currently uses `localtunnel` to expose the local dashboard remotely. The main pain point is that localtunnel requires a password, creating friction when accessing the dashboard.

## Requirements

1. **No signup/account required** - Should work immediately without registration
2. **Safe/secure** - Tunnel traffic should be encrypted
3. **Reliable with long connections** - Must support sessions lasting hours
4. **Ideally password-free** - Or at least easier than current solution

## Alternatives Evaluated

### 1. **ngrok** (Currently Used)

**Status**: Already implemented in Ralph as `useTunnel` hook

**Pros**:
- Extremely reliable and fast
- Free tier available (2 hours session limit on free tier)
- HTTPS by default
- No password requirement
- WebSocket support
- Built-in request inspection

**Cons**:
- Free tier has 2-hour tunnel timeout (tunnels auto-close)
- Requires ngrok agent installation
- Random URLs change on each restart (free tier)
- Rate limiting on free tier

**Verdict**: ✅ **Best choice** - Already implemented and meets all requirements

---

### 2. **Cloudflare Tunnel (cloudflared)**

**Website**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

**Pros**:
- Completely free, no time limits
- Very reliable (Cloudflare infrastructure)
- No account required for quick tunnels
- Supports long-running connections
- WebSocket support
- Built-in DDoS protection

**Cons**:
- Requires cloudflared CLI installation
- URLs are less memorable than ngrok
- Setup slightly more complex

**Verdict**: ✅ **Strong alternative** - Free forever, very reliable

---

### 3. **Tailscale Funnel**

**Website**: https://tailscale.com/kb/1223/tailscale-funnel/

**Pros**:
- Part of Tailscale VPN service
- Very secure (WireGuard-based)
- No time limits
- Great for team access

**Cons**:
- Requires Tailscale account and setup
- More complex setup than other options
- Overkill for simple dashboard sharing

**Verdict**: ⚠️ **Overengineered** - Better for team VPN scenarios

---

### 4. **localhost.run**

**Website**: https://localhost.run/

**Pros**:
- Zero installation (uses SSH)
- No account required
- Simple one-liner: `ssh -R 80:localhost:3737 localhost.run`
- Free and unlimited

**Cons**:
- Requires SSH client
- Less reliable than ngrok/cloudflared
- Random subdomains
- SSH port forwarding can be blocked by firewalls
- Less polished experience

**Verdict**: ⚠️ **Backup option** - Works in a pinch, but less reliable

---

### 5. **Bore.pub**

**Website**: https://github.com/ekzhang/bore

**Pros**:
- Open source
- No account required
- Simple Rust binary
- Free public server at bore.pub

**Cons**:
- Relatively new/less battle-tested
- Public server reliability unknown
- Smaller community
- Less documentation

**Verdict**: ⚠️ **Experimental** - Interesting but unproven at scale

---

### 6. **Tunnelmole**

**Website**: https://github.com/robbie-cahill/tunnelmole-client

**Pros**:
- Open source
- No account required
- npm installable
- Free tier available

**Cons**:
- Newer service, less proven
- Reliability concerns
- Smaller infrastructure
- Limited documentation

**Verdict**: ⚠️ **Too new** - Not proven for production use

---

### 7. **Local Tunnel (Current)**

**Website**: https://github.com/localtunnel/localtunnel

**Pros**:
- npm installable
- No account required
- Open source

**Cons**:
- **Requires password** (main pain point)
- Less reliable than ngrok
- Random URLs
- Sometimes slow
- Connection drops more frequently

**Verdict**: ❌ **Current solution** - Password requirement is the problem

---

## Recommendations

### Option A: Stick with ngrok (Current Implementation) ✅ **RECOMMENDED**

Ralph already uses ngrok via the `useTunnel` hook. This is the best solution because:

1. **Already implemented** - No code changes needed
2. **Most reliable** - Industry standard for tunneling
3. **No password** - Clean UX
4. **Free tier works** - 2 hour limit is acceptable for most sessions
5. **Best UX** - Fast, reliable, well-documented

The 2-hour timeout on free tier is manageable since:
- Most Ralph sessions complete faster
- Auto-reconnect could be implemented if needed
- Paid tier ($8/month) removes all limits

### Option B: Add Cloudflare Tunnel as Alternative

Could add cloudflared as a secondary option for users who:
- Need longer than 2 hours
- Want zero time limits
- Don't want to pay

Implementation would be similar to ngrok integration.

### Option C: Implement "Approve Connection" Pattern

Instead of changing tunneling service, implement the security pattern suggested in PRD:

```
1. Dashboard client connects to tunnel URL
2. CLI shows: "Dashboard connection request - Press (a) to approve"
3. Until approved, dashboard shows "Awaiting permission..." spinner
4. After approval, dashboard connects normally
```

**Benefits**:
- Adds security layer regardless of tunnel service
- Solves "safe URL" concern from PRD
- Works with any tunneling solution
- Prevents unauthorized access

**Implementation**:
- Add WebSocket handshake/approval flow
- Add keyboard shortcut handler in CLI
- Add pending state to dashboard
- Store approved connection IDs

---

## Conclusion

**Recommendation**: **Keep ngrok, add approval pattern**

1. **Short term**: ngrok is already working great - no changes needed
2. **Medium term**: Implement "approve connection" security pattern for better security
3. **Long term**: Consider adding Cloudflare Tunnel as option for unlimited free tier

The password requirement complaint is actually about localtunnel, but Ralph has already moved to ngrok which doesn't require passwords. The real enhancement would be the approval pattern for security.

---

## Implementation Notes

If implementing approval pattern:

```typescript
// Add to WebServerState
interface WebServerState {
  // ... existing fields
  pendingConnections: Set<string>; // connection IDs awaiting approval
  approvedConnections: Set<string>; // approved connection IDs
}

// Add keyboard handler
onApprove: () => {
  // Approve pending connection
  // Broadcast approval to waiting dashboard
}

// Dashboard shows:
// "Awaiting permission from CLI..." with spinner
// Until approval message received
```

Keyboard shortcut bar would show:
```
[q] Quit  [v] Verbose  [d] Debug  [↑/↓] Iterations  [a] Approve dashboard
```

---

## References

- ngrok: https://ngrok.com
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- Tailscale Funnel: https://tailscale.com/kb/1223/tailscale-funnel/
- localhost.run: https://localhost.run/
- bore: https://github.com/ekzhang/bore
- tunnelmole: https://github.com/robbie-cahill/tunnelmole-client
- localtunnel: https://github.com/localtunnel/localtunnel
