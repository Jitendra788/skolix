from dataclasses import dataclass


@dataclass
class SmsSendResult:
    status: str
    provider: str = "stub"
    detail: str = ""


def send_sms(phone_number: str, message: str) -> SmsSendResult:
    # Stub sender for local development; persists "sent_simulated" in API records.
    if not phone_number.strip() or not message.strip():
        return SmsSendResult(status="failed_validation", detail="phone/message required")
    return SmsSendResult(status="sent_simulated", detail="SMS not sent in local stub mode")
