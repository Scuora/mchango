import { useEffect, useState } from "react";
import { formatKesShort } from "@/lib/money";
import { countUp } from "@/lib/reveal";

/** A figure that counts up from zero once the opening screen has gone. */
export function CountUp({ value, format = formatKesShort }: { value: number; format?: (minor: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => countUp(value, setShown), [value]);
  return <span aria-label={format(value)}>{format(shown)}</span>;
}
