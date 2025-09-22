"use client";

import dynamic from "next/dynamic";
import React from "react";

import FreeSignup from "@/app/components/FreeSignup";

export default function WhatsAppMonthCardsPage() {
  // Your spreadsheet ID for free signups
  const spreadsheetId = "1rWrkTM6Mh0bkwUpk1VsF3ReGkOk-piIoHDeCobSDHKY";
  return (
    <div className="space-y-6">
      <section>
        <FreeSignup spreadsheetId={spreadsheetId} />
      </section>
    </div>
  );
}
