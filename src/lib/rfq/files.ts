import { FILE_TYPES } from "./workflow";
export function fileError(name: string, size: number) {
  const type = name.split(".").pop()?.toLowerCase() ?? "";
  if (!FILE_TYPES.includes(type)) return "Unsupported file. Choose PDF, XLSX, XLS, CSV or TXT.";
  if (size === 0) return "This file is empty.";
  if (size > 5_500_000) return "File too large for extraction. Choose a file smaller than 5.5 MB.";
  return null;
}
export async function readQuoteFile(file: File): Promise<{ text: string; pdfBase64?: string }> {
  const error = fileError(file.name, file.size);
  if (error) throw new Error(error);
  const type = file.name.split(".").pop()?.toLowerCase();
  if (type === "pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Corrupted PDF file.");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.slice(i, i + 8192));
    return { text: "", pdfBase64: btoa(binary) };
  }
  if (type === "xlsx" || type === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const text = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return sheet ? `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}` : "";
    }).join("\n\n");
    if (!text.trim()) throw new Error("No quotation data found in the spreadsheet.");
    if (text.length > 60000) throw new Error("Spreadsheet contains too much text. Split it into smaller files.");
    return { text };
  }
  const text = await file.text();
  if (!text.trim()) throw new Error("No text found in this file.");
  if (text.length > 60000) throw new Error("File contains too much text. Split it into smaller files.");
  return { text };
}