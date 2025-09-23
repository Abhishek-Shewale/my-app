"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
const WhatsAppDashboard = dynamic(
  () => import("./components/WhatsAppMonthCards"),
  { ssr: false }
);
const SignupAnalyticsDashboard = dynamic(
  () => import("./components/FreeSignup"),
  { ssr: false }
);
const FreeSignupCompare = dynamic(
  () => import("./components/FreeSignupCompare"),
  { ssr: false }
);

export default function Page() {
  const [activeTab, setActiveTab] = useState("whatsapp");
  const [month, setMonth] = useState("2025-09");

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`${
        activeTab === id
          ? "bg-blue-600 text-white"
          : "bg-white text-gray-700 hover:bg-gray-100"
      } px-4 py-2 rounded-md border border-gray-300 text-sm font-medium`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <TabButton id="whatsapp" label="WhatsApp Dashboard" />
        <TabButton id="signup" label="Free Signup" />
        <TabButton id="compare" label="Compare" />
      </div>

      <div className="bg-gray-100 rounded-lg">
        {activeTab === "whatsapp" && (
          <WhatsAppDashboard
            hideNavButtons
            month={month}
            onChangeMonth={setMonth}
          />
        )}
        {activeTab === "signup" && (
          <SignupAnalyticsDashboard
            hideNavButtons
            showAssigneeFilter={false}
            month={month}
            onChangeMonth={setMonth}
          />
        )}
        {activeTab === "compare" && (
          <FreeSignupCompare month={month} onChangeMonth={setMonth} />
        )}
      </div>
    </div>
  );
}
