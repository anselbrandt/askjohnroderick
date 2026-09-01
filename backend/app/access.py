import ipaddress

from fastapi import HTTPException, Request

from app.config import ALLOWED_IPS


def client_ip(request: Request) -> str:
    """
    The caller's address as reported by Cloudflare.

    Cloudflare overwrites CF-Connecting-IP on every request it proxies and
    rejects any request that tries to set it, so on the tunnel path it is the
    only trustworthy client address.
    """
    return request.headers.get("cf-connecting-ip", "")


def from_lan(request: Request) -> bool:
    """
    True when the request reached Caddy directly over the local network.

    Caddy does not trust an inbound X-Forwarded-For (its trusted_proxies list is
    empty), so it overwrites the header with the real TCP peer. Requests through
    the Cloudflare tunnel always arrive from loopback, so a private address that
    is *not* loopback can only have come across the LAN - the same distinction a
    router firewall makes by ingress interface, which is why loopback has to be
    excluded here rather than lumped in with "private".
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    peer = forwarded.split(",")[-1].strip()
    try:
        address = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return address.is_private and not address.is_loopback and not address.is_link_local


async def allowlisted(request: Request) -> None:
    """Restrict a route to the LAN or ALLOWED_IPS. An empty allowlist opens it."""
    if not ALLOWED_IPS:
        return
    if from_lan(request) or client_ip(request) in ALLOWED_IPS:
        return
    raise HTTPException(status_code=403, detail="chat is not open to the public yet")
