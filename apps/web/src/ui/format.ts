export function money(amount: number, currency = "USD") {
  const symbol = currency === "USD" ? "$" : currency === "CNY" ? "¥" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function time(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function day(value: string) {
  return value.replaceAll("-", "/");
}
