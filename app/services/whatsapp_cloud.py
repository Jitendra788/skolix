"""Meta WhatsApp Cloud API — optional real delivery when env vars are set."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib import error, request


@dataclass(slots=True)
class WhatsAppSendResult:
    status: str
    detail: str = ""
    wa_message_id: str = ""


def is_configured() -> bool:
    token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    phone_id = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    return bool(token and phone_id)


def normalize_whatsapp_recipient(number: str) -> str:
    """Digits only, international, no + (Graph API format)."""
    digits = "".join(c for c in (number or "") if c.isdigit())
    if len(digits) == 10:
        return "91" + digits
    if len(digits) == 11 and digits.startswith("0"):
        return "91" + digits[1:]
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    if len(digits) >= 10:
        return digits
    return ""


def send_whatsapp_message(body: str, to_phone: str) -> WhatsAppSendResult:
    """
    Send a WhatsApp message via Cloud API.

    - If WHATSAPP_TEMPLATE_NAME is set, sends an approved template with one BODY variable
      (your full message text). Use this for parents who have not messaged you in 24h.
    - Otherwise sends type=text (only works inside customer service / 24h session window).
    """
    if not is_configured():
        return WhatsAppSendResult(status="skipped", detail="WHATSAPP_ACCESS_TOKEN / PHONE_NUMBER_ID not set")

    to_digits = normalize_whatsapp_recipient(to_phone)
    if not to_digits:
        return WhatsAppSendResult(status="failed_invalid_phone", detail="Could not parse phone")

    token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    phone_id = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    version = (os.getenv("WHATSAPP_API_VERSION") or "v21.0").strip().lstrip("/")
    tpl_name = (os.getenv("WHATSAPP_TEMPLATE_NAME") or "").strip()
    tpl_lang = (os.getenv("WHATSAPP_TEMPLATE_LANGUAGE") or "en_US").strip()

    text_body = (body or "").strip()
    if not text_body:
        return WhatsAppSendResult(status="failed", detail="Empty message")

    if tpl_name:
        payload: dict = {
            "messaging_product": "whatsapp",
            "to": to_digits,
            "type": "template",
            "template": {
                "name": tpl_name,
                "language": {"code": tpl_lang},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": text_body[:1024]}],
                    }
                ],
            },
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_digits,
            "type": "text",
            "text": {"preview_url": False, "body": text_body[:4096]},
        }

    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")

    try:
        with request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            code = int(resp.status)
    except error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        code = int(e.code)
        try:
            err_json = json.loads(raw)
            msg = str(
                (err_json.get("error") or {}).get("message")
                or (err_json.get("error") or {}).get("error_user_msg")
                or raw
            )
        except json.JSONDecodeError:
            msg = raw[:500]
        return WhatsAppSendResult(status=f"failed_http_{code}", detail=msg[:800])

    if code >= 400:
        return WhatsAppSendResult(status=f"failed_http_{code}", detail=raw[:800])

    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return WhatsAppSendResult(status="sent_unknown", detail=raw[:200])

    mids = (out.get("messages") or []) if isinstance(out, dict) else []
    mid = ""
    if isinstance(mids, list) and mids and isinstance(mids[0], dict):
        mid = str(mids[0].get("id") or "")
    return WhatsAppSendResult(status="sent", detail="ok", wa_message_id=mid)
