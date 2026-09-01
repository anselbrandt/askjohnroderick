from fastapi import HTTPException, Request

from app.config import ALLOWED_IPS


def client_ip(request: Request) -> str:
    """
    The caller's address as reported by Cloudflare.

    X-Forwarded-For is useless here - it only carries the tunnel's localhost
    hop (::1), not the browser. Cloudflare overwrites CF-Connecting-IP on every
    request it proxies, so it is the only trustworthy source on this path.
    """
    return request.headers.get("cf-connecting-ip", "")


async def allowlisted(request: Request) -> None:
    """Restrict a route to ALLOWED_IPS. An empty allowlist disables the check."""
    if not ALLOWED_IPS:
        return
    if client_ip(request) not in ALLOWED_IPS:
        raise HTTPException(
            status_code=403, detail="chat is not open to the public yet"
        )
