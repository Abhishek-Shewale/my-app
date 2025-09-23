"use client";

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

export default function WhatsAppDashboard({
  fallbackSpreadsheetId,
  hideNavButtons,
  month: controlledMonth,
  onChangeMonth,
}) {
  const router = useRouter();
  const [month, setMonth] = useState(controlledMonth || "2025-09");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [navigating, setNavigating] = useState(false);

  // Function to determine which spreadsheet ID to use based on month
  const getSpreadsheetId = (selectedMonth) => {
    const monthYear = selectedMonth.split("-");
    const year = parseInt(monthYear[0]);
    const monthNum = parseInt(monthYear[1]);

    if (year === 2025 && monthNum >= 6 && monthNum <= 8) {
      return "1kB5DB06cDJNOyaN62VKJ-OAAO49C6W3UYuRMothn2Lg";
    }

    if (year === 2025 && monthNum >= 9) {
      return "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI";
    }

    return (
      fallbackSpreadsheetId || "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI"
    );
  };

  const months = ["2025-06", "2025-07", "2025-08", "2025-09"];

  // keep local month in sync if parent controls it
  useEffect(() => {
    if (controlledMonth && controlledMonth !== month) {
      setMonth(controlledMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledMonth]);

  // OPTIMIZED: Remove artificial delay and prefetch data
  const handleNavigateToFreeSignup = () => {
    setNavigating(true);

    // Prefetch the signup page data before navigation
    const signupSpreadsheetId = "1rWrkTM6Mh0bkwUpk1VsF3ReGkOk-piIoHDeCobSDHKY";
    prefetchSignupData(signupSpreadsheetId, month);

    // Navigate immediately without delay
    router.push("/Freesignup");
  };

  // OPTIMIZED: Prefetch function for signup data
  const prefetchSignupData = async (spreadsheetId, selectedMonth) => {
    try {
      const cacheKey = `signup-stats-${selectedMonth}`;
      const cached = localStorage.getItem(cacheKey);

      if (!cached) {
        const url = new URL("/api/freesignupsheet", window.location.origin);
        url.searchParams.set("spreadsheetId", spreadsheetId);
        url.searchParams.set(
          "monthYear",
          selectedMonth.split("-")[1] + "-" + selectedMonth.split("-")[0]
        );

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
    Hindi: "#fb923c",
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
  const getCachedData = (monthKey, spreadsheetId) => {
    try {
      const cacheKey = `whatsapp-stats-${monthKey}-${spreadsheetId}`;
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

  const cacheData = (monthKey, spreadsheetId, data) => {
    try {
      const timestamp = new Date().getTime();
      const cacheKey = `whatsapp-stats-${monthKey}-${spreadsheetId}`;
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
    } catch (e) {
      console.error("Error caching data:", e);
    }
  };

  // OPTIMIZED: Fetch data with better error handling and immediate cache check
  useEffect(() => {
    if (!month) return;

    const spreadsheetId = getSpreadsheetId(month);

    // Check cache first - if data exists, show immediately
    const cachedStats = getCachedData(month, spreadsheetId);
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
        const url = new URL("/api/mastersheet", window.location.origin);
        url.searchParams.set("spreadsheetId", spreadsheetId);
        url.searchParams.set("month", month);

        const res = await fetch(url.toString(), {
          signal: controller.signal,
          // Add timeout to prevent hanging
          timeout: 10000,
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();

        cacheData(month, spreadsheetId, data);
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
  }, [month, fallbackSpreadsheetId]);

  // Process data from API response
  const processedData = useMemo(() => {
    if (!stats || !stats.contacts) return null;

    const totalContacts = stats.rawStats?.totalContacts ?? 0;
    const demoRequested = stats.rawStats?.demoRequested ?? 0;
    const demoNo = totalContacts - demoRequested;
    const conversionRate =
      totalContacts > 0 ? Math.round((demoRequested / totalContacts) * 100) : 0;

    const languageCount = {};
    const contactsByDate = {};

    stats.contacts.forEach((contact) => {
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

      if (contact.demoRequested === "Yes") {
        contactsByDate[day].demoRequested += 1;
      } else {
        contactsByDate[day].demoNo += 1;
      }

      let language = contact.language || "";

      if (language === "Not Selected" || language.trim() === "" || !language) {
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

    return {
      totalContacts,
      demoRequested,
      demoNo,
      languages: sortedLanguages,
      conversionRate,
      dailyData,
      avgDailyContacts: Math.round(
        totalContacts / Math.max(dailyData.length, 1)
      ),
      avgDailyDemos: Math.round(demoRequested / Math.max(dailyData.length, 1)),
    };
  }, [stats]);

  const StatCard = ({ title, value }) => (
    <div className="bg-white text-gray-800 p-4 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div className="text-3xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );

  const SimpleStatCard = ({ title, value }) => (
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
      // Show current data with subtle loading indicator
      return (
        <div className="relative">
          <div className="absolute top-4 right-4 z-10">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent bg-white shadow-lg"></div>
          </div>
          <div className="opacity-75">
            {/* Render current data with reduced opacity */}
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

  const currentSpreadsheetId = getSpreadsheetId(month);

  if (loading && !stats) return <LoadingState />;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!processedData) return <div className="p-6">Loading...</div>;

  const topLanguages = Object.entries(processedData.languages).slice(0, 6);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            DEPLOYH.AI PERFORMANCE DASHBOARD
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {!hideNavButtons && (
            <button
              onClick={handleNavigateToFreeSignup}
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
                  <span>Free Signup Dashboard</span>
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
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </>
              )}
            </button>
          )}
          <select
            value={month}
            onChange={(e) => {
              const val = e.target.value;
              if (onChangeMonth) onChangeMonth(val);
              setMonth(val);
            }}
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
          <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-blue-700 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 shadow transform -translate-y-20">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
              <span>Updating...</span>
            </div>
          </div>
        )}

        {/* Top 6 Cards Row - Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <SimpleStatCard
            title="TOTAL CONTACTS"
            value={processedData.totalContacts}
          />
          <SimpleStatCard
            title="DEMO REQUESTED"
            value={`${processedData.demoRequested} (${processedData.conversionRate}%)`}
          />
          <SimpleStatCard
            title="DEMO DECLINED"
            value={`${processedData.demoNo} (${
              100 - processedData.conversionRate
            }%)`}
          />
          {topLanguages.slice(0, 3).map(([language, count]) => (
            <SimpleStatCard
              key={language}
              title={`${language.toUpperCase()} USERS`}
              value={`${count} (${Math.round(
                (count / processedData.totalContacts) * 100
              )}%)`}
            />
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Side - Core Stats + All Language Cards */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard
                title="TOTAL CONTACTS"
                value={processedData.totalContacts}
                prevValue={620}
                prevChange={16}
                goal={800}
                goalChange={-10}
              />
              <StatCard
                title="DEMO REQUESTED"
                value={processedData.demoRequested}
                prevValue={95}
                prevChange={16}
                goal={150}
                goalChange={-27}
              />
              <StatCard
                title="CONVERSION RATE"
                value={`${processedData.conversionRate}%`}
                prevValue="13%"
                prevChange={2}
                goal="18%"
                goalChange={-3}
              />
              <StatCard
                title="AVG DAILY CONTACTS"
                value={processedData.avgDailyContacts}
                prevValue={18}
                prevChange={28}
                goal={25}
                goalChange={-8}
              />

              {Object.entries(processedData.languages).map(
                ([language, count]) => (
                  <StatCard
                    key={language}
                    title={`${language.toUpperCase()} USERS`}
                    value={count}
                    prevValue={Math.round(count * 0.85)}
                    prevChange={Math.round(Math.random() * 30 - 5)}
                    goal={Math.round(count * 1.2)}
                    goalChange={Math.round(Math.random() * 20 - 10)}
                  />
                )
              )}
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
        <div className="mt-6 text-xs text-gray-500">
          Processed sheets: {stats.metadata.totalSheetsProcessed} — rows
          processed: {stats.metadata.totalRowsProcessed}
        </div>
      )}
    </div>
  );
}
