from decimal import Decimal, getcontext

getcontext().prec = 28


def to_decimal(val) -> Decimal:
    if val is None:
        return Decimal("0.00")
    if isinstance(val, Decimal):
        return val
    if isinstance(val, float):
        return Decimal(str(val))
    s = str(val).strip().replace(",", "")
    if s == "":
        return Decimal("0.00")
    return Decimal(s)
