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

  useEffect(() => {
    if (controlledMonth && controlledMonth !== selectedMonth) {
      setSelectedMonth(controlledMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledMonth]);

  const handleNavigateToWhatsApp = () => {
    setNavigating(true);
    prefetchWhatsAppData(selectedMonth);
    router.push("/WhatsAppMonthCards");
  };

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

        fetch(url.toString())
          .then((res) => res.json())
          .then((data) => {
            const timestamp = new Date().getTime();
            localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
          })
          .catch(() => {});
      }
    } catch (e) {
      // ignore
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

  const getCachedData = (monthKey) => {
    try {
      const cacheKey = `signup-stats-${monthKey}`;
      const cachedData = localStorage.getItem(cacheKey);
      if (!cachedData) return null;

      const { data, timestamp } = JSON.parse(cachedData);
      const now = new Date().getTime();
      const fifteenMinutesInMs = 15 * 60 * 1000;

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

  const normalizeContact = (contact) => {
    if (!contact) return "";
    const cleaned = contact.toString().replace(/[^0-9]/g, "");
    if (cleaned.startsWith("91") && cleaned.length === 12) {
      return cleaned.substring(2);
    }
    if (cleaned.length === 10) {
      return cleaned;
    }
    return cleaned;
  };

  useEffect(() => {
    if (!selectedMonth) return;

    const cachedStats = getCachedData(selectedMonth);
    if (cachedStats) {
      setStats(cachedStats);
      setError(null);
    }

    try {
      const convCacheRaw = localStorage.getItem("conversion-cache-v1");
      if (convCacheRaw) {
        const { data, timestamp } = JSON.parse(convCacheRaw);
        const now = Date.now();
        const ttl = 15 * 60 * 1000;
        if (now - timestamp < ttl) {
          setConversionStats(data);
        }
      }
    } catch {}

    if (!cachedStats) {
      setLoading(true);
    }
    setError(null);

    const controller = new AbortController();
    let isMounted = true;

    const fetchStats = async () => {
      try {
        // Add timeout to prevent hanging requests
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 30000); // 30 second timeout

        // Fetch with retry logic
        const fetchWithRetry = async (url, retries = 3) => {
          for (let i = 0; i < retries; i++) {
            try {
              const response = await fetch(url, { 
                signal: controller.signal,
                headers: {
                  'Cache-Control': 'no-cache',
                }
              });
              if (response.ok) return response;
              if (i === retries - 1) throw new Error(`HTTP ${response.status}`);
            } catch (err) {
              if (i === retries - 1) throw err;
              await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
            }
          }
        };

        const [freeSignupRes, conversionRes] = await Promise.all([
          fetchWithRetry(
            new URL("/api/freesignupsheet", window.location.origin).toString() +
              "?" +
              new URLSearchParams({
                spreadsheetId: SPREADSHEET_ID,
                monthYear:
                  selectedMonth.split("-")[1] +
                  "-" +
                  selectedMonth.split("-")[0],
              })
          ),
          fetchWithRetry(
            new URL("/api/conversionsheet", window.location.origin).toString() +
              "?" +
              new URLSearchParams({
                spreadsheetId: CONVERSION_SPREADSHEET_ID,
              })
          ),
        ]);

        clearTimeout(timeoutId);

        if (!isMounted) return;

        const [freeSignupData, conversionData] = await Promise.all([
          freeSignupRes.json(),
          conversionRes.json(),
        ]);

        if (!isMounted) return;

        cacheData(selectedMonth, freeSignupData);
        setStats(freeSignupData);
        // debug: inspect contacts returned (remove after verifying)
        console.log(
          "API contacts sample:",
          freeSignupData.contacts && freeSignupData.contacts.slice(0, 6)
        );
        setConversionStats(conversionData);
        try {
          localStorage.setItem(
            "conversion-cache-v1",
            JSON.stringify({ data: conversionData, timestamp: Date.now() })
          );
        } catch {}
        setError(null);
      } catch (err) {
        if (err.name !== "AbortError" && isMounted) {
          setError(err.message || "Failed to load data. Please try again.");
          console.error("Fetch error:", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Debounce the fetch to prevent rapid successive calls
    const debouncedFetch = setTimeout(fetchStats, 300);
    
    return () => {
      isMounted = false;
      clearTimeout(debouncedFetch);
      controller.abort();
    };
  }, [selectedMonth, SPREADSHEET_ID, CONVERSION_SPREADSHEET_ID]);

  // Process data from API response — strict mapping and only count completed if requested
  const processedData = useMemo(() => {
    if (!stats || !stats.contacts) return null;

    // Helper: case-insensitive field lookup (handles header name variations)
    const getContactField = (contact, name) => {
      if (!contact) return undefined;
      const norm = (s) =>
        String(s || "")
          .toLowerCase()
          .replace(/[\s_]+/g, "");
      const target = norm(name);
      for (const key of Object.keys(contact)) {
        if (norm(key) === target) return contact[key];
      }
      // fallback to direct access
      return contact[name] ?? contact[name?.toLowerCase?.()] ?? undefined;
    };

    const strictYes = (v) =>
      v !== undefined && v !== null && String(v).trim().toLowerCase() === "yes";
    const strictNo = (v) =>
      v !== undefined && v !== null && String(v).trim().toLowerCase() === "no";

    // Filter contacts by assignee
    let filteredContacts = stats.contacts;
    if (selectedAssignee !== "All") {
      filteredContacts = stats.contacts.filter(
        (c) => (c.assignedTo || "").toString() === selectedAssignee
      );
    }

    // Debug: Log sample contacts to verify field mapping
    if (filteredContacts.length > 0) {
      console.log("Sample contact fields:", {
        demoRequested: getContactField(filteredContacts[0], "demoRequested"),
        demoStatus: getContactField(filteredContacts[0], "demoStatus"),
        contactKeys: Object.keys(filteredContacts[0]),
        rawContact: filteredContacts[0]
      });
      
      // Also try direct field access
      console.log("Direct field access:", {
        "Demo requested": filteredContacts[0]["Demo requested"],
        "Demo Status": filteredContacts[0]["Demo Status"],
        "demoRequested": filteredContacts[0]["demoRequested"],
        "demoStatus": filteredContacts[0]["demoStatus"]
      });
    }

    const totalContacts = filteredContacts.length;

    // Demo metrics (strict mapping)
    let demoRequested = 0;
    let demoDeclined = 0;
    let demoCompleted = 0;

    // language & daily buckets
    const languageCount = {};
    const contactsByDate = {};

    // Sales matching
    let salesCount = 0;
    const salesByAssignee = {};
    const salesByDate = {};
    const seenSaleKeys = new Set();

    if (conversionStats && conversionStats.data) {
      const freeSignupByEmail = new Map();
      const freeSignupByContact = new Map();

      filteredContacts.forEach((contact) => {
        if (contact.email)
          freeSignupByEmail.set(contact.email.toLowerCase().trim(), contact);
        if (contact.phone) {
          const np = normalizeContact(contact.phone);
          if (np) freeSignupByContact.set(np, contact);
        }
      });

      conversionStats.data.forEach((sale) => {
        let matchedContact = null;
        if (sale.email)
          matchedContact = freeSignupByEmail.get(
            String(sale.email).toLowerCase().trim()
          );
        if (!matchedContact && sale.contact) {
          const ns = normalizeContact(sale.contact);
          if (ns) matchedContact = freeSignupByContact.get(ns);
        }
        if (matchedContact) {
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
            const d = new Date(matchedContact.timestamp);
            const day = isNaN(d.getTime()) ? 1 : d.getDate();
            salesByDate[day] = (salesByDate[day] || 0) + 1;
          }
        }
      });
    }

    // Walk contacts once
    filteredContacts.forEach((contact, index) => {
      // Try multiple field name variations
      const reqField = getContactField(contact, "demoRequested") || 
                      getContactField(contact, "Demo requested") ||
                      getContactField(contact, "Demo Requested") ||
                      contact["Demo requested"] ||
                      contact["demoRequested"];
                      
      const statusField = getContactField(contact, "demoStatus") || 
                         getContactField(contact, "Demo Status") ||
                         getContactField(contact, "Demo Status") ||
                         contact["Demo Status"] ||
                         contact["demoStatus"];

      const requested = strictYes(reqField); // "yes" in demo requested
      const declined = strictNo(reqField); // "no" in demo requested
      // only count completed if the contact had requested a demo AND demo status is yes
      const completed = requested && strictYes(statusField);

      // Debug: Log first few contacts to verify field values
      if (index < 3) {
        console.log(`Contact ${index + 1}:`, {
          demoRequested: reqField,
          demoStatus: statusField,
          requested,
          declined,
          completed
        });
      }

      if (requested) demoRequested += 1;
      if (declined) demoDeclined += 1;
      if (completed) demoCompleted += 1;

      // Date handling
      const d = new Date(contact.timestamp);
      const day = isNaN(d.getTime()) ? 1 : d.getDate();
      if (!contactsByDate[day]) {
        contactsByDate[day] = {
          day,
          totalContacts: 0,
          demoRequested: 0,
          demoNo: 0,
          demoDeclined: 0,
          demoCompleted: 0,
        };
      }
      contactsByDate[day].totalContacts += 1;

      if (requested) {
        contactsByDate[day].demoRequested += 1;
      } else if (declined) {
        contactsByDate[day].demoNo += 1;
        contactsByDate[day].demoDeclined += 1;
      }

      if (completed) contactsByDate[day].demoCompleted += 1;

      const language = normalizeLanguage(contact.language);
      languageCount[language] = (languageCount[language] || 0) + 1;
      contactsByDate[day][language] = (contactsByDate[day][language] || 0) + 1;
    });

    const assignedContacts = filteredContacts.filter(
      (c) => c.assignedTo && String(c.assignedTo).trim() !== ""
    ).length;
    const unassignedContacts = totalContacts - assignedContacts;

    const conversionRate =
      totalContacts > 0 ? Math.round((salesCount / totalContacts) * 100) : 0;
    const demoCompletionRate =
      demoRequested > 0 ? Math.round((demoCompleted / demoRequested) * 100) : 0;
    const salesFromCompletedRate =
      demoCompleted > 0 ? Math.round((salesCount / demoCompleted) * 100) : 0;
    const overallSalesFromRequestsRate =
      demoRequested > 0 ? Math.round((salesCount / demoRequested) * 100) : 0;

    const sortedLanguages = Object.entries(languageCount)
      .sort(([, a], [, b]) => b - a)
      .reduce((o, [k, v]) => {
        o[k] = v;
        return o;
      }, {});

    const dailyData = Object.values(contactsByDate)
      .sort((a, b) => a.day - b.day)
      .map((dayObj) => {
        const processedDay = {
          ...dayObj,
          conversionRate:
            dayObj.totalContacts > 0
              ? ((salesByDate[dayObj.day] || 0) / dayObj.totalContacts) * 100
              : 0,
          demoCompleted: dayObj.demoCompleted,
        };
        Object.keys(sortedLanguages).forEach((lang) => {
          if (!processedDay[lang]) processedDay[lang] = 0;
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
      demoNo: demoDeclined,
      salesCount,
      salesByAssignee,
      assignedContacts,
      unassignedContacts,
      languages: sortedLanguages,
      boards: boardCount,
      grades: gradeCount,
      statuses: statusCount,
      conversionRate,
      demoCompletionRate,
      salesFromCompletedRate,
      overallSalesFromRequestsRate,
      dailyData,
      avgDailyContacts: Math.round(
        totalContacts / Math.max(dailyData.length, 1)
      ),
      avgDailyDemos: Math.round(demoRequested / Math.max(dailyData.length, 1)),
    };
  }, [stats, selectedAssignee, conversionStats]);

  const assignees = useMemo(() => {
    if (!stats || !stats.contacts)
      return ["All", selectedAssignee].filter(Boolean);
    const uniqueAssignees = [
      ...new Set(stats.contacts.map((c) => c.assignedTo).filter(Boolean)),
    ];
    if (
      selectedAssignee &&
      selectedAssignee !== "All" &&
      !uniqueAssignees.includes(selectedAssignee)
    ) {
      uniqueAssignees.push(selectedAssignee);
    }
    return ["All", ...uniqueAssignees.sort()];
  }, [stats, selectedAssignee]);

  const SimpleStatCard = ({ title, value, className = "", isCritical = false }) => {
    return (
      <div
        className={`bg-white text-gray-800 p-3 rounded-lg shadow-md border border-gray-200 ${className}`}
      >
        <h3 className="text-xs font-medium mb-1 text-gray-600 uppercase">
          {title}
        </h3>
        <div
          className={`text-xl font-bold flex items-center gap-2 ${
            isCritical ? "text-red-600" : ""
          }`}
        >
          <span>
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
          {isCritical && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="w-5 h-5 text-red-600"
              aria-label="Downtrend"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 6 3, 0 6" fill="currentColor" />
                </marker>
              </defs>
              <polyline
                points="4,12 20,28 28,20 44,36"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#arrowhead)"
              />
            </svg>
          )}
        </div>
      </div>
    );
  };

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

      <div className={`${loading && stats ? "relative" : ""}`}>
        {loading && stats && (
          <div className="absolute top-0 right-0 z-10 bg-blue-50 px-3 py-1 rounded-bl-lg border-l border-b border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
              <span>Updating...</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <SimpleStatCard
            title="TOTAL CONTACTS"
            value={processedData.totalContacts}
          />
          <SimpleStatCard
            title="DEMO REQUEST"
            value={processedData.demoRequested}
          />
          <SimpleStatCard
            title="DEMO COMPLETE"
            value={processedData.demoCompleted}
          />
          <SimpleStatCard
            title="DEMO DECLINED"
            value={processedData.demoDeclined}
          />
          <SimpleStatCard title="SALES" value={processedData.salesCount} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <SimpleStatCard
            title="Demo Completion Rate"
            value={`${processedData.demoCompletionRate}%`}
            isCritical={processedData.demoCompletionRate < 5}
          />
          <SimpleStatCard
            title="Sales Conversion from Completed Demos"
            value={`${processedData.salesFromCompletedRate}%`}
            isCritical={processedData.salesFromCompletedRate < 5}
          />
          <SimpleStatCard
            title="Overall Sales Conversion from Demo Requests"
            value={`${processedData.overallSalesFromRequestsRate}%`}
            isCritical={processedData.overallSalesFromRequestsRate < 5}
          />
        </div>

        <AIRecommendationCards
          dashboardType="freesignup"
          data={processedData}
          month={selectedMonth}
        />

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
