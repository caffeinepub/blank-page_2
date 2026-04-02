import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRightLeft,
  Clock,
  Code2,
  Copy,
  History,
  Info,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ============================================================
// PLANCK TIME CONSTANTS
// ============================================================
// t_P = sqrt(hbar * G / c^5) ≈ 5.391247e-44 seconds
// 1/t_P ≈ 1.8549e+43 Planck units per second

const INVERSE_PLANCK_BIG = 18549000000000000000000000000000000000000000n; // ≈ 1.8549 × 10^43 /s

function computePlanckBig(nowMs: number): bigint {
  const ms = BigInt(Math.floor(nowMs));
  return (ms * INVERSE_PLANCK_BIG) / 1000n;
}

function formatBigIntSci(n: bigint, sigDigits = 10): string {
  const s = n.toString();
  if (s.length <= 1) return s;
  const exp = s.length - 1;
  const mantissa = `${s[0]}.${s.slice(1, sigDigits)}`;
  return `${mantissa} × 10^${exp}`;
}

function formatBigIntFull(n: bigint): string {
  const s = n.toString();
  let result = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) result += " ";
    result += s[i];
  }
  return result;
}

function formatDateTime(date: Date, tz: string): string {
  return date.toLocaleString("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    fractionalSecondDigits: 3,
  });
}

function formatUTCFull(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms} UTC`;
}

function parseSciToBigInt(input: string): bigint | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/ /g, "");
  if (!trimmed) return null;
  try {
    if (/^\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    const match = trimmed.match(/^([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (match) {
      const mantissaStr = match[1].replace(".", "");
      const dotPos = match[1].indexOf(".");
      const mantissaDecimals = dotPos >= 0 ? match[1].length - dotPos - 1 : 0;
      const exponent = Number.parseInt(match[2], 10);
      const totalExp = exponent - mantissaDecimals;
      if (totalExp >= 0) {
        return BigInt(mantissaStr) * 10n ** BigInt(totalExp);
      }
      return BigInt(mantissaStr) / 10n ** BigInt(-totalExp);
    }
    return null;
  } catch {
    return null;
  }
}

function planckToUnixMs(planck: bigint): number {
  const ms = (planck * 1000n) / INVERSE_PLANCK_BIG;
  return Number(ms);
}

interface ClockState {
  planckBig: bigint;
  unixMs: number;
  date: Date;
}

interface ConversionEntry {
  id: string;
  direction: "P→U" | "U→P";
  input: string;
  output: string;
  time: Date;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        toast.success(label ? `Copied ${label}!` : "Copied!");
      })
      .catch(() => {
        toast.error("Failed to copy");
      });
  }, [value, label]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center w-6 h-6 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
      title={`Copy ${label ?? "value"}`}
    >
      <Copy size={10} />
    </button>
  );
}

function ClockRow({
  label,
  value,
}: { label: string; value: string; accent?: boolean; large?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <span
        className="text-muted-foreground font-mono uppercase shrink-0 pt-0.5"
        style={{ minWidth: "140px" }}
      >
        {label}
      </span>
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <span className="font-mono break-all leading-tight text-foreground">
          {value}
        </span>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

export default function App() {
  const [clock, setClock] = useState<ClockState>(() => {
    const now = Date.now();
    return {
      planckBig: computePlanckBig(now),
      unixMs: now,
      date: new Date(now),
    };
  });

  const [sciMode, setSciMode] = useState(true);

  const [planckInput, setPlanckInput] = useState("");
  const [planckResult, setPlanckResult] = useState<{
    unixMs: number;
    date: Date;
  } | null>(null);
  const [planckError, setPlanckError] = useState("");

  const [unixInput, setUnixInput] = useState("");
  const [unixUnit, setUnixUnit] = useState<
    "seconds" | "milliseconds" | "microseconds" | "nanoseconds"
  >("seconds");
  const [unixResult, setUnixResult] = useState<{ planck: bigint } | null>(null);
  const [unixError, setUnixError] = useState("");

  const [history, setHistory] = useState<ConversionEntry[]>([]);

  const addHistory = useCallback(
    (entry: Omit<ConversionEntry, "id" | "time">) => {
      setHistory((prev) => [
        { ...entry, id: Math.random().toString(36).slice(2), time: new Date() },
        ...prev.slice(0, 9),
      ]);
    },
    [],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setClock({
        planckBig: computePlanckBig(now),
        unixMs: now,
        date: new Date(now),
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const unixS = (clock.unixMs / 1000).toFixed(3);
  const unixMsStr = clock.unixMs.toString();
  const unixUsStr = (BigInt(clock.unixMs) * 1000n).toString();
  const unixNsStr = (BigInt(clock.unixMs) * 1000000n).toString();
  const utcStr = formatUTCFull(clock.date);
  const gmt4Str = `${formatDateTime(clock.date, "America/New_York")} EST`;
  const planckDisplay = sciMode
    ? formatBigIntSci(clock.planckBig, 15)
    : formatBigIntFull(clock.planckBig);

  const convertPlanckToUnix = useCallback(() => {
    setPlanckError("");
    setPlanckResult(null);
    if (!planckInput.trim()) {
      setPlanckError("Please enter a Planck timestamp.");
      return;
    }
    const parsed = parseSciToBigInt(planckInput);
    if (parsed === null) {
      setPlanckError(
        "Invalid input. Use an integer or scientific notation like 1.234e60",
      );
      return;
    }
    const ms = planckToUnixMs(parsed);
    const date = new Date(ms);
    setPlanckResult({ unixMs: ms, date });
    addHistory({
      direction: "P→U",
      input: planckInput.slice(0, 40),
      output: formatUTCFull(date),
    });
  }, [planckInput, addHistory]);

  const convertUnixToPlanck = useCallback(() => {
    setUnixError("");
    setUnixResult(null);
    if (!unixInput.trim()) {
      setUnixError("Please enter a Unix timestamp or date string.");
      return;
    }
    let unixMs: number;
    if (/[a-zA-Z]/.test(unixInput)) {
      const parsed = new Date(unixInput);
      if (Number.isNaN(parsed.getTime())) {
        setUnixError(
          "Could not parse date string. Try ISO 8601 format: 2024-01-15T12:00:00Z",
        );
        return;
      }
      unixMs = parsed.getTime();
    } else {
      const val = Number.parseFloat(
        unixInput.replace(/,/g, "").replace(/ /g, ""),
      );
      if (Number.isNaN(val)) {
        setUnixError("Invalid number.");
        return;
      }
      switch (unixUnit) {
        case "seconds":
          unixMs = val * 1000;
          break;
        case "milliseconds":
          unixMs = val;
          break;
        case "microseconds":
          unixMs = val / 1000;
          break;
        case "nanoseconds":
          unixMs = val / 1_000_000;
          break;
      }
    }
    const planck = computePlanckBig(unixMs);
    setUnixResult({ planck });
    addHistory({
      direction: "U→P",
      input: unixInput.slice(0, 40),
      output: formatBigIntSci(planck, 10),
    });
  }, [unixInput, unixUnit, addHistory]);

  const tickerRef = useRef<HTMLSpanElement>(null);

  const pythonCode = `import time
import decimal

# Planck time in seconds (exact to available precision)
PLANCK_TIME_S = 5.391247e-44  # seconds

def unix_to_planck_float(unix_seconds: float) -> int:
    """Fast approximation — loses precision beyond ~15 significant digits."""
    return int(unix_seconds / PLANCK_TIME_S)


def unix_to_planck_precise(unix_ms: int) -> int:
    """
    High-precision version using integer arithmetic at millisecond resolution.
    INVERSE_PLANCK_PER_S ≈ 1.8549e+43 (1 / 5.391247e-44)
    """
    INVERSE_PLANCK_PER_S = 18_549_000_000_000_000_000_000_000_000_000_000_000_000_000
    return (unix_ms * INVERSE_PLANCK_PER_S) // 1000


def unix_to_planck_decimal(unix_seconds: float) -> decimal.Decimal:
    """Highest precision using Python's Decimal module."""
    decimal.getcontext().prec = 60
    t_P = decimal.Decimal('5.391247e-44')
    return decimal.Decimal(str(unix_seconds)) / t_P


# Example usage
unix_s = time.time()
unix_ms = int(unix_s * 1000)

print(f"Unix seconds:  {unix_s:.3f}")
print(f"Planck (fast): {unix_to_planck_float(unix_s):.4e}")
print(f"Planck (int):  {unix_to_planck_precise(unix_ms)}")
print(f"Planck (dec):  {unix_to_planck_decimal(unix_s):.6e}")`;

  const jsCode = `// Planck time converter using BigInt for high precision
// t_P ≈ 5.391247e-44 seconds → 1/t_P ≈ 1.8549e+43 per second

const INVERSE_PLANCK_PER_S = 18549000000000000000000000000000000000000000n;

function unixToPlanck(unixMs) {
  return (BigInt(Math.floor(unixMs)) * INVERSE_PLANCK_PER_S) / 1000n;
}

function planckToUnixMs(planck) {
  return Number((planck * 1000n) / INVERSE_PLANCK_PER_S);
}

function toScientific(n, digits = 10) {
  const s = n.toString();
  const exp = s.length - 1;
  return s[0] + '.' + s.slice(1, digits) + ' × 10^' + exp;
}

const now = Date.now();
const planck = unixToPlanck(now);
console.log('Unix ms:    ', now);
console.log('Planck:     ', planck.toString());
console.log('Scientific: ', toScientific(planck));
console.log('Round-trip: ', planckToUnixMs(planck), 'ms');`;

  const rustCode = `use std::time::{SystemTime, UNIX_EPOCH};

// For full precision, use the 'num-bigint' crate.
// u128 max is ~3.4e38; real Planck timestamps need num-bigint.

/// With num-bigint crate for full precision:
/// use num_bigint::BigUint;
///
/// fn unix_ms_to_planck(unix_ms: u64) -> BigUint {
///     let scale = BigUint::parse_bytes(
///         b"18549000000000000000000000000000000000000000",
///         10
///     ).unwrap();
///     BigUint::from(unix_ms) * scale / 1000u32
/// }

fn main() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();
    let unix_ms = now.as_millis() as u64;
    println!("Unix ms: {}", unix_ms);
    println!("Note: Use 'num-bigint' crate for full ~60-digit precision.");
}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1
                className="font-bold text-foreground"
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: "8px",
                }}
              >
                SMIMS Time Converter
              </h1>
              <p
                className="text-muted-foreground"
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: "8px",
                }}
              >
                by{" "}
                <a
                  href="https://mimsaras-5x0.caffeine.xyz/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  Mims A. Ras
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="blink w-2 h-2 rounded-full bg-foreground inline-block" />
            <span className="text-muted-foreground font-mono">LIVE</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-8 space-y-6">
        {/* ===== LIVE CLOCK CARD ===== */}
        <Card className="border-border bg-card" data-ocid="clock.card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-semibold uppercase tracking-widest text-muted-foreground">
                <Clock size={12} />
                Live Planck Clock
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSciMode((v) => !v)}
                  className="font-mono px-3 py-1 border border-border text-foreground hover:bg-muted transition-colors"
                  data-ocid="clock.toggle"
                >
                  {sciMode ? "SCI" : "RAW"}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {/* Dominant Planck number */}
            <div className="border border-border p-4 mb-4">
              <div className="font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Planck Timestamp
              </div>
              <div className="flex items-start justify-between gap-3">
                <span
                  ref={tickerRef}
                  className="font-mono text-foreground break-all leading-tight"
                  data-ocid="clock.planck.display"
                >
                  {planckDisplay}
                </span>
                <CopyButton
                  value={clock.planckBig.toString()}
                  label="Planck timestamp"
                />
              </div>
              <div className="mt-2 font-mono text-muted-foreground">
                {sciMode
                  ? "scientific notation"
                  : "raw integer (space-separated groups of 3)"}
              </div>
            </div>

            <ClockRow label="Unix Seconds" value={unixS} />
            <ClockRow label="Unix Milliseconds" value={unixMsStr} />
            <ClockRow label="Unix Microseconds" value={`${unixUsStr} (μs)`} />
            <ClockRow
              label="Unix Nanoseconds"
              value={`${unixNsStr} (ns, est.)`}
            />
            <ClockRow label="UTC" value={utcStr} />
            <ClockRow label="GMT-4 / Eastern" value={gmt4Str} />
          </CardContent>
        </Card>

        {/* ===== BIDIRECTIONAL CONVERTER ===== */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          data-ocid="converter.section"
        >
          {/* Planck → Unix */}
          <Card
            className="border-border bg-card"
            data-ocid="planck_to_unix.card"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-semibold uppercase tracking-widest text-muted-foreground">
                <ArrowRightLeft size={12} />
                Planck → Unix
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label
                  htmlFor="planck-input"
                  className="font-mono uppercase tracking-wider text-muted-foreground block mb-2"
                >
                  Planck Timestamp
                </label>
                <Input
                  id="planck-input"
                  placeholder="e.g. 3.5e60 or 35000...000"
                  value={planckInput}
                  onChange={(e) => setPlanckInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && convertPlanckToUnix()}
                  className="font-mono bg-background border-border text-foreground placeholder:text-muted-foreground"
                  data-ocid="planck_to_unix.input"
                />
                {planckError && (
                  <p
                    className="text-destructive font-mono mt-1"
                    data-ocid="planck_to_unix.error_state"
                  >
                    {planckError}
                  </p>
                )}
              </div>
              <Button
                onClick={convertPlanckToUnix}
                variant="outline"
                className="w-full font-mono"
                data-ocid="planck_to_unix.submit_button"
              >
                Convert
              </Button>

              {planckResult && (
                <div
                  className="border border-border p-3 space-y-1"
                  data-ocid="planck_to_unix.success_state"
                >
                  <ClockRow
                    label="Unix Seconds"
                    value={(planckResult.unixMs / 1000).toFixed(3)}
                  />
                  <ClockRow
                    label="Unix Milliseconds"
                    value={planckResult.unixMs.toString()}
                  />
                  <ClockRow
                    label="UTC"
                    value={formatUTCFull(planckResult.date)}
                  />
                  <ClockRow
                    label="GMT-4 / Eastern"
                    value={`${formatDateTime(planckResult.date, "America/New_York")} EST`}
                  />
                  <ClockRow
                    label="PST"
                    value={`${formatDateTime(planckResult.date, "America/Los_Angeles")} PST`}
                  />
                  <ClockRow
                    label="London"
                    value={`${formatDateTime(planckResult.date, "Europe/London")} GMT`}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unix → Planck */}
          <Card
            className="border-border bg-card"
            data-ocid="unix_to_planck.card"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-semibold uppercase tracking-widest text-muted-foreground">
                <ArrowRightLeft size={12} />
                Unix → Planck
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label
                  htmlFor="unix-input"
                  className="font-mono uppercase tracking-wider text-muted-foreground block mb-2"
                >
                  Unix Timestamp or Date String
                </label>
                <Input
                  id="unix-input"
                  placeholder="e.g. 1700000000 or 2024-01-15T12:00:00Z"
                  value={unixInput}
                  onChange={(e) => setUnixInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && convertUnixToPlanck()}
                  className="font-mono bg-background border-border text-foreground placeholder:text-muted-foreground"
                  data-ocid="unix_to_planck.input"
                />
                {unixError && (
                  <p
                    className="text-destructive font-mono mt-1"
                    data-ocid="unix_to_planck.error_state"
                  >
                    {unixError}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="unix-unit"
                  className="font-mono uppercase tracking-wider text-muted-foreground block mb-2"
                >
                  Unit (if numeric)
                </label>
                <Select
                  value={unixUnit}
                  onValueChange={(v) => setUnixUnit(v as typeof unixUnit)}
                >
                  <SelectTrigger
                    id="unix-unit"
                    className="bg-background border-border font-mono"
                    data-ocid="unix_to_planck.select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="seconds" className="font-mono">
                      Seconds
                    </SelectItem>
                    <SelectItem value="milliseconds" className="font-mono">
                      Milliseconds
                    </SelectItem>
                    <SelectItem value="microseconds" className="font-mono">
                      Microseconds (μs)
                    </SelectItem>
                    <SelectItem value="nanoseconds" className="font-mono">
                      Nanoseconds (ns)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={convertUnixToPlanck}
                variant="outline"
                className="w-full font-mono"
                data-ocid="unix_to_planck.submit_button"
              >
                Convert
              </Button>

              {unixResult && (
                <div
                  className="border border-border p-3 space-y-2"
                  data-ocid="unix_to_planck.success_state"
                >
                  <div>
                    <div className="font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Scientific Notation
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-foreground break-all">
                        {formatBigIntSci(unixResult.planck, 12)}
                      </span>
                      <CopyButton
                        value={formatBigIntSci(unixResult.planck, 12)}
                        label="Planck (sci)"
                      />
                    </div>
                  </div>
                  <Separator className="bg-border" />
                  <div>
                    <div className="font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Raw Integer
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-foreground break-all">
                        {unixResult.planck.toString()}
                      </span>
                      <CopyButton
                        value={unixResult.planck.toString()}
                        label="Planck (raw)"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== CONVERSION HISTORY ===== */}
        <Card className="border-border bg-card" data-ocid="history.card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-semibold uppercase tracking-widest text-muted-foreground">
                <History size={12} />
                Conversion History
              </CardTitle>
              {history.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistory([])}
                  className="text-muted-foreground hover:text-destructive font-mono"
                  data-ocid="history.delete_button"
                >
                  <Trash2 size={10} className="mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div
                className="text-center py-8 text-muted-foreground font-mono"
                data-ocid="history.empty_state"
              >
                No conversions yet. Use the converter above.
              </div>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-2">
                  {history.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 p-3 border border-border"
                      data-ocid={`history.item.${i + 1}`}
                    >
                      <Badge
                        variant="outline"
                        className="font-mono shrink-0 border-border text-foreground"
                      >
                        {entry.direction}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-muted-foreground truncate">
                          IN:{" "}
                          <span className="text-foreground">{entry.input}</span>
                        </div>
                        <div className="font-mono text-muted-foreground truncate">
                          OUT:{" "}
                          <span className="text-foreground">
                            {entry.output}
                          </span>
                        </div>
                      </div>
                      <div className="text-muted-foreground font-mono shrink-0">
                        {entry.time.toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* ===== WHAT IS PLANCK TIME ===== */}
        <Card className="border-border bg-card" data-ocid="info.card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-semibold uppercase tracking-widest text-muted-foreground">
              <Info size={12} />
              What is Planck Time?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border border-border p-4">
              <p className="font-mono text-foreground text-center">
                t&#x2099; = √(ℏG/c⁵) ≈ 5.391247 × 10⁻⁴⁴ s
              </p>
            </div>
            <p className="text-foreground leading-relaxed">
              The <strong>Planck time</strong> is the fundamental quantum of
              time in theoretical physics — the smallest meaningful interval of
              time, below which the concepts of spacetime and causality as we
              understand them break down. It emerges from three fundamental
              constants: the reduced Planck constant (ℏ), the gravitational
              constant (G), and the speed of light (c).
            </p>
            <p className="text-foreground leading-relaxed">
              It represents the timescale at which quantum gravitational effects
              become significant. At scales shorter than t&#x2099;, conventional
              physics (general relativity + quantum mechanics) gives meaningless
              predictions — a theory of quantum gravity is required.
            </p>
            <Separator className="bg-border" />
            <div className="space-y-2">
              <h3 className="font-mono uppercase tracking-widest text-muted-foreground">
                ⚠ Important Caveats
              </h3>
              <ul className="space-y-2 text-foreground">
                <li className="flex gap-2">
                  <span className="shrink-0">→</span>
                  <span>
                    The current Unix epoch expressed in Planck units is
                    approximately <span className="font-mono">~8.6 × 10⁶⁰</span>{" "}
                    — a 61-digit number.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0">→</span>
                  <span>
                    Modern atomic clocks can measure to ~10⁻¹⁸ seconds. Planck
                    time is{" "}
                    <span className="font-mono">10²⁶ times smaller</span> —
                    completely beyond any physical measurement.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0">→</span>
                  <span>
                    The millisecond resolution of{" "}
                    <span className="font-mono">Date.now()</span> means these
                    Planck timestamps are only accurate to ~10⁴⁰ Planck units
                    (the last 40 digits are effectively zero).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0">→</span>
                  <span>
                    This converter is a mathematical/educational tool. The
                    numbers are exact by definition but carry no physical
                    measurement beyond millisecond precision.
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* ===== CODE SNIPPETS ===== */}
        <Card className="border-border bg-card" data-ocid="code.card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-semibold uppercase tracking-widest text-muted-foreground">
              <Code2 size={12} />
              Code Snippets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="python" data-ocid="code.tab">
              <TabsList className="bg-background border border-border mb-4">
                <TabsTrigger
                  value="python"
                  className="font-mono"
                  data-ocid="code.python.tab"
                >
                  Python
                </TabsTrigger>
                <TabsTrigger
                  value="javascript"
                  className="font-mono"
                  data-ocid="code.javascript.tab"
                >
                  JavaScript
                </TabsTrigger>
                <TabsTrigger
                  value="rust"
                  className="font-mono"
                  data-ocid="code.rust.tab"
                >
                  Rust
                </TabsTrigger>
              </TabsList>

              <TabsContent value="python">
                <div className="relative">
                  <pre className="border border-border p-4 overflow-x-auto font-mono leading-relaxed text-foreground">
                    <code>{pythonCode}</code>
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton value={pythonCode} label="Python code" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="javascript">
                <div className="relative">
                  <pre className="border border-border p-4 overflow-x-auto font-mono leading-relaxed text-foreground">
                    <code>{jsCode}</code>
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton value={jsCode} label="JavaScript code" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rust">
                <div className="relative">
                  <pre className="border border-border p-4 overflow-x-auto font-mono leading-relaxed text-foreground">
                    <code>{rustCode}</code>
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton value={rustCode} label="Rust code" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ===== QUICK REFERENCE ===== */}
        <Card className="border-border bg-card">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Planck Time", value: "5.391247 × 10⁻⁴⁴ s" },
                { label: "Planck/Second", value: "1.8549 × 10⁴³" },
                { label: "Epoch in Planck", value: "~8.6 × 10⁶⁰" },
                { label: "Planck vs Atomic", value: "10²⁶ × smaller" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="border border-border p-3 text-center"
                >
                  <div className="font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    {item.label}
                  </div>
                  <div className="font-mono text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-[1200px] mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-mono text-muted-foreground text-center">
            t&#x2099; = √(ℏG/c⁵) ≈ 5.391247 × 10⁻⁴⁴ s
          </p>
          <p className="text-muted-foreground text-center">
            <a
              href="https://internetcomputer.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              ♾️
            </a>{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              ☕
            </a>{" "}
            <a
              href="https://internetcomputer.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              ♾️
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
