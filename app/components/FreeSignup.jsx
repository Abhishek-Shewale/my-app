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
import AIRecommendationCards from "./AIRecommendationCards";

export default function SignupAnalyticsDashboard({
  spreadsheetId,
  defaultAssignee,
  hideNavButtons,
  month: controlledMonth,
  onChangeMonth,
  showAssigneeFilter = false,
}) {
  const router = useRouter();
  const [selectedAssignee, setSelectedAssignee] = useState(
    defaultAssignee || "All"
  );
  const [selectedMonth, setSelectedMonth] = useState(
    controlledMonth || "2025-09"
  );
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [conversionStats, setConversionStats] = useState(null);
  const [error, setError] = useState(null);
  const [navigating, setNavigating] = useState(false);

  const SPREADSHEET_ID =
    spreadsheetId || "1rWrkTM6Mh0bkwUpk1VsF3ReGkOk-piIoHDeCobSDHKY";
  const CONVERSION_SPREADSHEET_ID =
    "195gQV7QzJ-uoKzqGVapMdF5-zAWQyzuF_I8ffkNGc-o";
  const months = ["2025-09"];

  // keep local month in sync if parent controls it
  useEffect(() => {
    if (controlledMonth && controlledMonth !== selectedMonth) {
      setSelectedMonth(controlledMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledMonth]);

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

  // Normalize language labels to canonical case-insensitive values
  const normalizeLanguage = (lang) => {
    if (!lang) return "Other";
    const value = String(lang).trim().toLowerCase();
    if (!value || value === "not selected" || value === "not provided") {
      return "Other";
    }
    const map = {
      english: "English",
      hindi: "Hindi",
      marathi: "Marathi",
      bengali: "Bengali",
      gujarati: "Gujarati",
      telugu: "Telugu",
      tamil: "Tamil",
      kannada: "Kannada",
      malayalam: "Malayalam",
      punjabi: "Punjabi",
      odia: "Odia",
      assamese: "Assamese",
      urdu: "Urdu",
    };
    return map[value] || "Other";
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

  // Helper function to normalize contact numbers
  const normalizeContact = (contact) => {
    if (!contact) return "";
    const cleaned = contact.toString().replace(/[^0-9]/g, "");
    // If starts with 91 and has 12 digits, remove 91
    if (cleaned.startsWith("91") && cleaned.length === 12) {
      return cleaned.substring(2);
    }
    // If has 10 digits, keep as is
    if (cleaned.length === 10) {
      return cleaned;
    }
    return cleaned;
  };

  // OPTIMIZED: Fetch data with better error handling and immediate cache check
  useEffect(() => {
    if (!selectedMonth) return;

    // Check cache first - if data exists, show immediately
    const cachedStats = getCachedData(selectedMonth);
    if (cachedStats) {
      setStats(cachedStats);
      setError(null);
    }

    // Read cached conversion data to avoid late sales rendering
    try {
      const convCacheRaw = localStorage.getItem("conversion-cache-v1");
      if (convCacheRaw) {
        const { data, timestamp } = JSON.parse(convCacheRaw);
        const now = Date.now();
        const ttl = 15 * 60 * 1000; // 15 minutes
        if (now - timestamp < ttl) {
          setConversionStats(data);
        }
      }
    } catch {}

    // Only set loading if no cached data
    if (!cachedStats) {
      setLoading(true);
    }
    setError(null);

    const controller = new AbortController();

    const fetchStats = async () => {
      try {
        // Fetch both freesignup and conversion data
        const [freeSignupRes, conversionRes] = await Promise.all([
          fetch(
            new URL("/api/freesignupsheet", window.location.origin).toString() +
              "?" +
              new URLSearchParams({
                spreadsheetId: SPREADSHEET_ID,
                monthYear:
                  selectedMonth.split("-")[1] +
                  "-" +
                  selectedMonth.split("-")[0],
              }),
            { signal: controller.signal }
          ),
          fetch(
            new URL("/api/conversionsheet", window.location.origin).toString() +
              "?" +
              new URLSearchParams({
                spreadsheetId: CONVERSION_SPREADSHEET_ID,
              }),
            { signal: controller.signal }
          ),
        ]);

        if (!freeSignupRes.ok)
          throw new Error(`FreeSignup API error ${freeSignupRes.status}`);
        if (!conversionRes.ok)
          throw new Error(`Conversion API error ${conversionRes.status}`);

        const [freeSignupData, conversionData] = await Promise.all([
          freeSignupRes.json(),
          conversionRes.json(),
        ]);

        cacheData(selectedMonth, freeSignupData);
        setStats(freeSignupData);
        setConversionStats(conversionData);
        // Cache conversion data
        try {
          localStorage.setItem(
            "conversion-cache-v1",
            JSON.stringify({ data: conversionData, timestamp: Date.now() })
          );
        } catch {}
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
  }, [selectedMonth, SPREADSHEET_ID, CONVERSION_SPREADSHEET_ID]);

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

    // For free signup, everyone accepts demo and completes it
    const demoRequested = totalContacts;
    const demoCompleted = totalContacts;
    const demoDeclined = 0;

    // Calculate sales by matching with conversion data
    let salesCount = 0;
    let salesByAssignee = {};
    const salesByDate = {};
    const seenSaleKeys = new Set();

    if (conversionStats && conversionStats.data) {
      // Create lookup maps for faster matching
      const freeSignupByEmail = new Map();
      const freeSignupByContact = new Map();

      filteredContacts.forEach((contact) => {
        if (contact.email) {
          freeSignupByEmail.set(contact.email.toLowerCase().trim(), contact);
        }
        if (contact.phone) {
          const normalizedPhone = normalizeContact(contact.phone);
          if (normalizedPhone) {
            freeSignupByContact.set(normalizedPhone, contact);
          }
        }
      });

      // Match conversion data with free signup data
      conversionStats.data.forEach((sale) => {
        let matchedContact = null;

        // Try email match first
        if (sale.email) {
          matchedContact = freeSignupByEmail.get(
            sale.email.toLowerCase().trim()
          );
        }

        // Try contact match if email didn't work
        if (!matchedContact && sale.contact) {
          const normalizedSaleContact = normalizeContact(sale.contact);
          if (normalizedSaleContact) {
            matchedContact = freeSignupByContact.get(normalizedSaleContact);
          }
        }

        if (matchedContact) {
          // prevent double counting same contact if multiple sale rows match
          const uniqueKey =
            (matchedContact.email &&
              matchedContact.email.toLowerCase().trim()) ||
            (matchedContact.phone && normalizeContact(matchedContact.phone)) ||
            Math.random().toString(36);
          if (!seenSaleKeys.has(uniqueKey)) {
            seenSaleKeys.add(uniqueKey);
            salesCount++;
            const assignee = matchedContact.assignedTo || "Unassigned";
            salesByAssignee[assignee] = (salesByAssignee[assignee] || 0) + 1;
            // Per-day sales attribution based on contact signup day
            const d = new Date(matchedContact.timestamp);
            const day = d.getDate();
            salesByDate[day] = (salesByDate[day] || 0) + 1;
            // Debug log for sales attribution
            console.log("[FreeSignup] Matched sale:", {
              sale,
              matchedContact: {
                name: matchedContact.name,
                email: matchedContact.email,
                phone: matchedContact.phone,
                assignedTo: matchedContact.assignedTo,
              },
              attributedTo: assignee,
              day,
            });
          }
        }
      });
    }

    // Calculate assigned/unassigned counts
    const assignedContacts = filteredContacts.filter(
      (contact) => contact.assignedTo && contact.assignedTo.trim() !== ""
    ).length;
    const unassignedContacts = totalContacts - assignedContacts;

    // Conversion rate = Sales / Total Contacts (%), rounded
    const conversionRate =
      totalContacts > 0 ? Math.round((salesCount / totalContacts) * 100) : 0;

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

      // Normalize language value to avoid case-sensitive duplicates
      let language = normalizeLanguage(contact.language);

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
          // Sales conversion rate per day = salesForDay / totalContacts
          conversionRate:
            day.totalContacts > 0
              ? ((salesByDate[day.day] || 0) / day.totalContacts) * 100
              : 0,
          // show demoCompleted for chart parity
          demoCompleted: day.totalContacts,
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
      demoCompleted,
      demoDeclined,
      demoNo: demoDeclined, // Keep for backward compatibility
      salesCount,
      salesByAssignee,
      assignedContacts,
      unassignedContacts,
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
  }, [stats, selectedAssignee, conversionStats]);

  // Get unique assignees from data
  const assignees = useMemo(() => {
    if (!stats || !stats.contacts)
      return ["All", selectedAssignee].filter(Boolean);
    const uniqueAssignees = [
      ...new Set(stats.contacts.map((c) => c.assignedTo).filter(Boolean)),
    ];
    // Ensure the current selection is present as an option
    if (
      selectedAssignee &&
      selectedAssignee !== "All" &&
      !uniqueAssignees.includes(selectedAssignee)
    ) {
      uniqueAssignees.push(selectedAssignee);
    }
    return ["All", ...uniqueAssignees.sort()];
  }, [stats, selectedAssignee]);

  const SimpleStatCard = ({
    title,
    value,
    color = "bg-blue-500",
    breakdown,
  }) => (
    <div className="bg-white text-gray-800 p-3 sm:p-4 rounded-lg shadow-lg border border-gray-200 min-h-20 sm:min-h-24 flex flex-col justify-center">
      <h3 className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 text-gray-600">
        {title}
      </h3>
      <div className="text-lg sm:text-2xl font-bold mb-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {breakdown && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {breakdown.map((item, index) => (
            <div key={index} className="flex justify-between">
              <span>{item.label}</span>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // OPTIMIZED: Show skeleton instead of spinner when data exists but loading
  const LoadingState = () => {
    if (stats && loading) {
      return (
        <div className="relative">
          <div className="absolute top-4 right-4 z-10">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent bg-white shadow-lg"></div>
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
  if (!processedData) return <div className="p-6">Loading...</div>;

  const topLanguages = Object.entries(processedData.languages).slice(0, 3);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {!hideNavButtons && (
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
          )}
          <h1 className="text-2xl font-bold text-gray-800">
            FREE SIGNUP ANALYTICS DASHBOARD
          </h1>
        </div>
        <div className="flex gap-4">
          {showAssigneeFilter && (
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
          )}
          <select
            value={selectedMonth}
            onChange={(e) => {
              const val = e.target.value;
              if (onChangeMonth) onChangeMonth(val);
              setSelectedMonth(val);
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
          <div className="absolute top-0 right-0 z-10 bg-blue-50 px-3 py-1 rounded-bl-lg border-l border-b border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
              <span>Updating...</span>
            </div>
          </div>
        )}
        {/* Top 6 Cards Row - Main Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-4 mb-6">
          <SimpleStatCard
            title="TOTAL CONTACTS"
            value={processedData.totalContacts}
            breakdown={[
              { label: "Assigned", value: processedData.assignedContacts },
              { label: "Unassigned", value: processedData.unassignedContacts },
            ]}
            color="bg-blue-500"
          />
          <SimpleStatCard
            title="DEMO REQUEST"
            value={processedData.demoRequested}
            color="bg-green-500"
          />
          <SimpleStatCard
            title="DEMO COMPLETE"
            value={processedData.demoCompleted}
            color="bg-emerald-500"
          />
          <SimpleStatCard
            title="DEMO DECLINED"
            value={processedData.demoDeclined}
            color="bg-red-500"
          />
          <SimpleStatCard
            title="SALES"
            value={processedData.salesCount}
            color="bg-yellow-500"
          />
          <SimpleStatCard
            title="CONVERSION RATE"
            value={`${processedData.conversionRate}%`}
            color="bg-purple-500"
          />
        </div>

        {/* AI Recommendation Cards */}
        <AIRecommendationCards
          dashboardType="freesignup"
          data={processedData}
          month={selectedMonth}
        />

        {/* Two Charts Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              DAILY LEAD GENERATION
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={processedData.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Line
                    type="monotone"
                    dataKey="totalContacts"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={{ fill: "#60a5fa", r: 3 }}
                    name="Total Contacts"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center mt-2 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-400 mr-2"></div>
                <span>Total Contacts</span>
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
                      fill={languageColors[language] || languageColors["Other"]}
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
