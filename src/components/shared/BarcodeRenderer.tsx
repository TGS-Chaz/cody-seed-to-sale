import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type BarcodeFormat = "code128" | "qr" | "datamatrix" | "ean13" | "pdf417";

const BCID_BY_FORMAT: Record<BarcodeFormat, string> = {
  code128: "code128",
  qr: "qrcode",
  datamatrix: "datamatrix",
  ean13: "ean13",
  pdf417: "pdf417",
};

export interface BarcodeRendererProps {
  value: string;
  format?: BarcodeFormat;
  /** Rendered width in pixels (SVG scales) */
  width?: number;
  /** Rendered height in pixels (for linear barcodes; 2D ignore) */
  height?: number;
  showText?: boolean;
  className?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

/**
 * Inline SVG barcode renderer powered by bwip-js.
 * Lazy-imports bwip-js so it only ships when a barcode is rendered.
 */
export default function BarcodeRenderer({
  value, format = "code128", width, height = 60, showText = true,
  className, backgroundColor, foregroundColor,
}: BarcodeRendererProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) { setSvg(null); return; }
    (async () => {
      try {
        const bwipjs = await import("bwip-js/browser");
        const bcid = BCID_BY_FORMAT[format];
        const is2D = format === "qr" || format === "datamatrix" || format === "pdf417";
        const opts: any = {
          bcid, text: value,
          includetext: showText && !is2D,
          textxalign: "center",
          paddingwidth: 2, paddingheight: 2,
          backgroundcolor: backgroundColor?.replace("#", ""),
          barcolor: foregroundColor?.replace("#", ""),
        };
        if (is2D) {
          opts.scale = Math.max(2, Math.floor((width ?? height) / 24));
        } else {
          opts.scale = 2;
          opts.height = Math.max(8, Math.floor(height / 4));
        }
        const svgStr = bwipjs.toSVG(opts);
        if (!cancelled) setSvg(svgStr);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Barcode render failed");
      }
    })();
    return () => { cancelled = true; };
  }, [value, format, width, height, showText, backgroundColor, foregroundColor]);

  if (error) {
    return <span className={cn("text-[11px] text-destructive font-mono", className)}>Barcode error: {error}</span>;
  }
  if (!svg) {
    return <div className={cn("inline-block bg-muted/30 rounded", className)} style={{ width: width ?? 120, height }} />;
  }
  return (
    <div
      ref={containerRef}
      className={cn("inline-block", className)}
      style={{ width, height: format === "qr" || format === "datamatrix" ? width ?? height : height }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
