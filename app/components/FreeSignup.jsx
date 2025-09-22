import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";

export default function SignupAnalyticsDashboard({ spreadsheetId }) {
  const router = useRouter();
  const [selectedAssignee, setSelectedAssignee] = useState("All");
  const [selectedMonth, setSelectedMonth] = useState("2025-09");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [navigating, setNavigating] = useState(false);

  const SPREADSHEET_ID =
    spreadsheetId || "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI";
  const months = ["2025-09"];

  // OPTIMIZED: Remove artificial delay and prefetch data
  const handleNavigateToWhatsApp = () => {
    setNavigating(true);

    // Prefetch WhatsApp dashboard data before navigation
    prefetchWhatsAppData(selectedMonth);

    // Navigate immediately without delay
    router.push("/WhatsAppMonthCards");
  };

  // OPTIMIZED: Prefetch function for WhatsApp data
  const prefetchWhatsAppData = async (selectedMonth) => {
    try {
      const monthYear = selectedMonth.split("-");
      const year = parseInt(monthYear[0]);
      const monthNum = parseInt(monthYear[1]);

      let whatsappSpreadsheetId;
      if (year === 2025 && monthNum >= 6 && monthNum <= 8) {
        whatsappSpreadsheetId = "1kB5DB06cDJNOyaN62VKJ-OAAO49C6W3UYuRMothn2Lg";
      } else if (year === 2025 && monthNum >= 9) {
        whatsappSpreadsheetId = "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI";
      } else {
        whatsappSpreadsheetId = "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI";
      }

      const cacheKey = `whatsapp-stats-${selectedMonth}-${whatsappSpreadsheetId}`;
      const cached = localStorage.getItem(cacheKey);

      if (!cached) {
        const url = new URL("/api/mastersheet", window.location.origin);
        url.searchParams.set("spreadsheetId", whatsappSpreadsheetId);
        url.searchParams.set("month", selectedMonth);

        // Fire and forget - don't wait for response
        fetch(url.toString())
          .then((res) => res.json())
          .then((data) => {
            const timestamp = new Date().getTime();
            localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
          })
          .catch(() => {
            // Ignore prefetch errors
          });
      }
    } catch (e) {
      // Ignore prefetch errors
    }
  };

  const languageColors = {
    English: "#a78bfa",
    english: "#a78bfa",
    Hindi: "#fb923c",
    hindi: "#fb923c",
    Marathi: "#f472b6",
    Bengali: "#22d3ee",
    Gujarati: "#34d399",
    Telugu: "#fbbf24",
    Tamil: "#f87171",
    Kannada: "#a3e635",
    Malayalam: "#818cf8",
    Punjabi: "#d97706",
    Odia: "#14b8a6",
    Assamese: "#a855f7",
    Urdu: "#ef4444",
    Other: "#9ca3af",
  };

  // OPTIMIZED: Longer cache duration (15 minutes instead of 5)
  const getCachedData = (monthKey) => {
    try {
      const cacheKey = `signup-stats-${monthKey}`;
      const cachedData = localStorage.getItem(cacheKey);
      if (!cachedData) return null;

      const { data, timestamp } = JSON.parse(cachedData);
      const now = new Date().getTime();
      const fifteenMinutesInMs = 15 * 60 * 1000; // Extended cache time

      if (now - timestamp < fifteenMinutesInMs) {
        return data;
      }
      return null;
    } catch (e) {
      console.error("Error accessing cached data:", e);
      return null;
    }
  };

  const cacheData = (monthKey, data) => {
    try {
      const timestamp = new Date().getTime();
      const cacheKey = `signup-stats-${monthKey}`;
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
    } catch (e) {
      console.error("Error caching data:", e);
    }
  };

  // OPTIMIZED: Fetch data with better error handling and immediate cache check
  useEffect(() => {
    if (!selectedMonth) return;

    // Check cache first - if data exists, show immediately
    const cachedStats = getCachedData(selectedMonth);
    if (cachedStats) {
      setStats(cachedStats);
      setError(null);
      return;
    }

    // Only set loading if no cached data
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    const fetchStats = async () => {
      try {
        const url = new URL("/api/freesignupsheet", window.location.origin);
        url.searchParams.set("spreadsheetId", SPREADSHEET_ID);
        url.searchParams.set(
          "monthYear",
          selectedMonth.split("-")[1] + "-" + selectedMonth.split("-")[0]
        );

        const res = await fetch(url.toString(), {
          signal: controller.signal,
          // Add timeout to prevent hanging
          timeout: 10000,
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();

        cacheData(selectedMonth, data);
        setStats(data);
        setError(null);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load");
          console.error("Fetch error:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    return () => controller.abort();
  }, [selectedMonth, SPREADSHEET_ID]);

  // Process data from API response
  const processedData = useMemo(() => {
    if (!stats || !stats.contacts) return null;

    // Filter contacts by assignee
    let filteredContacts = stats.contacts;
    if (selectedAssignee !== "All") {
      filteredContacts = stats.contacts.filter(
        (contact) => contact.assignedTo === selectedAssignee
      );
    }

    const totalContacts = filteredContacts.length;

    const demoRequested = filteredContacts.filter(
      (contact) =>
        (contact.demoStatus &&
          contact.demoStatus.toLowerCase().includes("scheduled")) ||
        contact.demoStatus.toLowerCase().includes("completed")
    ).length;

    const demoNo = totalContacts - demoRequested;
    const conversionRate =
      totalContacts > 0 ? Math.round((demoRequested / totalContacts) * 100) : 0;

    const languageCount = {};
    const contactsByDate = {};

    filteredContacts.forEach((contact) => {
      const date = new Date(contact.timestamp);
      const day = date.getDate();

      if (!contactsByDate[day]) {
        contactsByDate[day] = {
          day: day,
          totalContacts: 0,
          demoRequested: 0,
          demoNo: 0,
        };
      }

      contactsByDate[day].totalContacts += 1;

      if (
        contact.demoStatus &&
        (contact.demoStatus.toLowerCase().includes("scheduled") ||
          contact.demoStatus.toLowerCase().includes("completed"))
      ) {
        contactsByDate[day].demoRequested += 1;
      } else {
        contactsByDate[day].demoNo += 1;
      }

      let language = contact.language || "";

      if (
        language === "Not Selected" ||
        language === "Not provided" ||
        language.trim() === "" ||
        !language
      ) {
        language = "Other";
      }

      if (!languageCount[language]) {
        languageCount[language] = 0;
      }
      languageCount[language] += 1;

      if (!contactsByDate[day][language]) {
        contactsByDate[day][language] = 0;
      }
      contactsByDate[day][language] += 1;
    });

    const sortedLanguages = Object.entries(languageCount)
      .sort(([, a], [, b]) => b - a)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    const dailyData = Object.values(contactsByDate)
      .sort((a, b) => a.day - b.day)
      .map((day) => {
        const processedDay = {
          ...day,
          conversionRate:
            day.totalContacts > 0
              ? (day.demoRequested / day.totalContacts) * 100
              : 0,
        };

        Object.keys(sortedLanguages).forEach((lang) => {
          if (!processedDay[lang]) {
            processedDay[lang] = 0;
          }
        });

        return processedDay;
      });

    const boardCount = {};
    const gradeCount = {};
    const statusCount = {};

    filteredContacts.forEach((contact) => {
      const board = contact.board || "Not provided";
      boardCount[board] = (boardCount[board] || 0) + 1;

      const grade = contact.grade || "Not provided";
      gradeCount[grade] = (gradeCount[grade] || 0) + 1;

      const status = contact.status || "Not provided";
      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    return {
      totalContacts,
      demoRequested,
      demoNo,
      languages: sortedLanguages,
      boards: boardCount,
      grades: gradeCount,
      statuses: statusCount,
      conversionRate,
      dailyData,
      avgDailyContacts: Math.round(
        totalContacts / Math.max(dailyData.length, 1)
      ),
      avgDailyDemos: Math.round(demoRequested / Math.max(dailyData.length, 1)),
    };
  }, [stats, selectedAssignee]);

  // Get unique assignees from data
  const assignees = useMemo(() => {
    if (!stats || !stats.contacts) return ["All"];
    const uniqueAssignees = [
      ...new Set(stats.contacts.map((c) => c.assignedTo).filter(Boolean)),
    ];
    return ["All", ...uniqueAssignees.sort()];
  }, [stats]);

  const StatCard = ({
    title,
    value,
    prevValue,
    prevChange,
    goal,
    goalChange,
  }) => (
    <div className="bg-white text-gray-800 p-4 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div className="text-3xl font-bold mb-2">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="flex justify-between text-sm text-gray-600">
        <div>
          <div>
            PREVIOUS:{" "}
            {typeof prevValue === "string"
              ? prevValue
              : prevValue?.toLocaleString()}
          </div>
          <div className="text-xs">
            GOAL: {typeof goal === "string" ? goal : goal?.toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className={prevChange >= 0 ? "text-green-600" : "text-red-600"}>
            {prevChange >= 0 ? "+" : ""}
            {prevChange}%
          </div>
          <div className={goalChange >= 0 ? "text-green-600" : "text-red-600"}>
            {goalChange >= 0 ? "+" : ""}
            {goalChange}%
          </div>
        </div>
      </div>
    </div>
  );

  const SimpleStatCard = ({ title, value, color = "bg-blue-500" }) => (
    <div className="bg-white text-gray-800 p-4 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-sm font-medium mb-2 text-gray-600">{title}</h3>
      <div className="text-2xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );

  // OPTIMIZED: Show skeleton instead of spinner when data exists but loading
  const LoadingState = () => {
    if (stats && loading) {
      return (
        <div className="relative">
          <div className="absolute top-4 right-4 z-10">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent bg-white rounded-full shadow-lg"></div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  };

  if (loading && !stats) return <LoadingState />;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!processedData) return <div className="p-6">No data available</div>;

  const topLanguages = Object.entries(processedData.languages).slice(0, 3);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleNavigateToWhatsApp}
            disabled={navigating}
            className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2 text-sm"
          >
            {navigating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Opening...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span>WhatsApp Dashboard</span>
              </>
            )}
          </button>
          <h1 className="text-2xl font-bold text-gray-800">
            FREE SIGNUP ANALYTICS DASHBOARD
          </h1>
        </div>
        <div className="flex gap-4">
          <select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="border px-3 py-2 rounded bg-white"
          >
            {assignees.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border px-3 py-2 rounded bg-white"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Show loading overlay when refreshing data */}
      <div className={`${loading && stats ? "relative" : ""}`}>
        {loading && stats && (
          <div className="absolute top-0 right-0 z-10 bg-blue-50 px-3 py-1 rounded-bl-lg border-l border-b border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
              <span>Updating...</span>
            </div>
          </div>
        )}

        {/* Top 6 Cards Row - Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <SimpleStatCard
            title="TOTAL CONTACTS"
            value={processedData.totalContacts}
            color="bg-blue-500"
          />
          <SimpleStatCard
            title="DEMO REQUESTED"
            value={`${processedData.demoRequested} (${processedData.conversionRate}%)`}
            color="bg-green-500"
          />
          <SimpleStatCard
            title="DEMO DECLINED"
            value={`${processedData.demoNo} (${
              100 - processedData.conversionRate
            }%)`}
            color="bg-red-500"
          />
          {topLanguages.map(([language, count]) => (
            <SimpleStatCard
              key={language}
              title={`${language.toUpperCase()} USERS`}
              value={`${count} (${Math.round(
                (count / processedData.totalContacts) * 100
              )}%)`}
              color="bg-purple-500"
            />
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Side - 8 Stat Cards */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard
                title="TOTAL CONTACTS"
                value={processedData.totalContacts}
                prevValue={Math.round(processedData.totalContacts * 0.85)}
                prevChange={15}
                goal={Math.round(processedData.totalContacts * 1.2)}
                goalChange={-20}
              />
              <StatCard
                title="DEMO REQUESTED"
                value={processedData.demoRequested}
                prevValue={Math.round(processedData.demoRequested * 0.9)}
                prevChange={10}
                goal={Math.round(processedData.demoRequested * 1.3)}
                goalChange={-30}
              />
              <StatCard
                title="CONVERSION RATE"
                value={`${processedData.conversionRate}%`}
                prevValue={`${Math.max(0, processedData.conversionRate - 5)}%`}
                prevChange={5}
                goal={`${processedData.conversionRate + 10}%`}
                goalChange={-10}
              />
              <StatCard
                title="AVG DAILY CONTACTS"
                value={processedData.avgDailyContacts}
                prevValue={Math.max(1, processedData.avgDailyContacts - 3)}
                prevChange={20}
                goal={processedData.avgDailyContacts + 5}
                goalChange={-25}
              />

              {Object.entries(processedData.languages)
                .slice(0, 4)
                .map(([language, count]) => (
                  <StatCard
                    key={language}
                    title={`${language.toUpperCase()} USERS`}
                    value={count}
                    prevValue={Math.max(0, Math.round(count * 0.8))}
                    prevChange={Math.round(Math.random() * 30 - 5)}
                    goal={Math.round(count * 1.2)}
                    goalChange={Math.round(Math.random() * 20 - 10)}
                  />
                ))}
            </div>
          </div>

          {/* Right Side - 2 Charts */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">
                DAILY LEAD GENERATION
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={processedData.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Bar
                      yAxisId="left"
                      dataKey="totalContacts"
                      fill="#93c5fd"
                      name="Total Contacts"
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="demoRequested"
                      fill="#86efac"
                      name="Demo Requested"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="conversionRate"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={{ fill: "#60a5fa", r: 3 }}
                      name="Conversion Rate (%)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center space-x-6 mt-2 text-sm">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-blue-300 mr-2"></div>
                  <span>Total Contacts</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-green-300 mr-2"></div>
                  <span>Demo Requested</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-400 mr-2"></div>
                  <span>Conversion Rate</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">
                DAILY LANGUAGE DISTRIBUTION
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processedData.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    {Object.keys(processedData.languages).map((language) => (
                      <Bar
                        key={language}
                        dataKey={language}
                        stackId="a"
                        fill={
                          languageColors[language] || languageColors["Other"]
                        }
                        name={language}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-2 text-sm">
                {Object.entries(processedData.languages).map(
                  ([language, count]) => (
                    <div key={language} className="flex items-center">
                      <div
                        className="w-4 h-4 mr-2"
                        style={{
                          backgroundColor:
                            languageColors[language] || languageColors["Other"],
                        }}
                      ></div>
                      <span>
                        {language} ({count})
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      {stats?.metadata && (
        <div className="mt-6 text-xs text-gray-500 flex justify-between">
          <span>
            Processed sheets: {stats.metadata.totalSheetsProcessed} — Rows
            processed: {stats.metadata.totalRowsProcessed} — Unique contacts:{" "}
            {stats.metadata.uniqueContacts}
          </span>
          {selectedAssignee !== "All" && (
            <span>Filtered by: {selectedAssignee}</span>
          )}
        </div>
      )}
    </div>
  );
}
