"use client";

import React, { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import ErrorBoundary from "./components/ErrorBoundary";
import { 
  FreeSignupLoading, 
  FreeSignupCompareLoading, 
  WhatsAppLoading 
} from "./components/LoadingComponents";

const WhatsAppDashboard = dynamic(
  () => import("./components/WhatsAppMonthCards"),
  { 
    ssr: false,
    loading: () => <WhatsAppLoading />
  }
);
const SignupAnalyticsDashboard = dynamic(
  () => import("./components/FreeSignup"),
  { 
    ssr: false,
    loading: () => <FreeSignupLoading />
  }
);
const FreeSignupCompare = dynamic(
  () => import("./components/FreeSignupCompare"),
  { 
    ssr: false,
    loading: () => <FreeSignupCompareLoading />
  }
);

export default function Page() {
  const [activeMainTab, setActiveMainTab] = useState("student-ai");
  const [activeSubTab, setActiveSubTab] = useState("whatsapp");
  const [month, setMonth] = useState("2025-09");

  const MainTabButton = ({ id, label }) => (
    <button
      onClick={() => {
        setActiveMainTab(id);
        if (id === "student-ai") {
          setActiveSubTab("whatsapp");
        }
      }}
      className={`${activeMainTab === id
        ? "text-white"
        : "bg-white text-gray-700 hover:bg-gray-100"
        } px-6 py-3 rounded-lg border border-gray-300 text-base font-semibold`}
      style={activeMainTab === id ? { backgroundColor: '#3C467B' } : {}}
    >
      {label}
    </button>
  );

  const SubTabButton = ({ id, label }) => (
    <button
      onClick={() => setActiveSubTab(id)}
      className={`${activeSubTab === id
        ? "text-white"
        : "bg-white text-gray-600 hover:bg-gray-50"
        } px-4 py-2 rounded-md border border-gray-300 text-sm font-medium`}
      style={activeSubTab === id ? { backgroundColor: '#3C467B' } : {}}
    >
      {label}
    </button>
  );

  const renderStudentAIContent = () => {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <SubTabButton id="whatsapp" label="Total Leads" />
          <SubTabButton id="signup" label="Free Signup" />
          <SubTabButton id="compare" label="Compare" />
        </div>
        <div className="bg-gray-100 rounded-lg">
          <ErrorBoundary>
            <Suspense fallback={<div className="p-6">Loading...</div>}>
              {activeSubTab === "whatsapp" && (
                <WhatsAppDashboard
                  hideNavButtons
                  month={month}
                  onChangeMonth={setMonth}
                />
              )}
              {activeSubTab === "signup" && (
                <SignupAnalyticsDashboard
                  hideNavButtons
                  showAssigneeFilter={false}
                  month={month}
                  onChangeMonth={setMonth}
                />
              )}
              {activeSubTab === "compare" && (
                <FreeSignupCompare month={month} onChangeMonth={setMonth} />
              )}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  };

  const renderWhatsAppAITutorContent = () => {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-700 mb-4">WhatsApp AI Tutor</h2>
        <p className="text-gray-600">Content for WhatsApp AI Tutor will be implemented here.</p>
      </div>
    );
  };

  const renderAIInnovationLabContent = () => {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-700 mb-4">AI Innovation Lab</h2>
        <p className="text-gray-600">Content for AI Innovation Lab will be implemented here.</p>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-6 ">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Image src="/Deployh AI Lab.jpg" alt="Deployh.ai" width={150} height={150} className="rounded-full" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            PERFORMANCE DASHBOARD
          </h1>
        </div>
        {/* Main Navigation Tabs */}
        <div className="flex flex-wrap gap-3 border px-3 py-2 rounded bg-white text-sm">
          <MainTabButton id="student-ai" label="Student AI" />
          <MainTabButton id="whatsapp-ai-tutor" label="WhatsApp AI Tutor" />
          <MainTabButton id="ai-innovation-lab" label="AI Innovation Lab" />
        </div>
      </div>

      {/* Content Area */}
      <div>
        {activeMainTab === "student-ai" && renderStudentAIContent()}
        {activeMainTab === "whatsapp-ai-tutor" && renderWhatsAppAITutorContent()}
        {activeMainTab === "ai-innovation-lab" && renderAIInnovationLabContent()}
      </div>
    </div>
  );
}
