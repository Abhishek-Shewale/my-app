import dynamic from "next/dynamic";
import React from "react";

import WhatsAppMonthCards from "@/app/components/WhatsAppMonthCards";

export default function WhatsAppMonthCardsPage() {
  // Optional fallback spreadsheet ID (used if month doesn't match any specific rules)
  const fallbackSpreadsheetId = "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI";

  return (
    <div className="space-y-6">
      <section>
        <WhatsAppMonthCards fallbackSpreadsheetId={fallbackSpreadsheetId} />
      </section>
    </div>
  );
}
