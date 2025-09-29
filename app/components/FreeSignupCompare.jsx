"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
} from "recharts";
import AIRecommendationCards from "./AIRecommendationCards";

export default function FreeSignupCompare({
  spreadsheetId,
  month: controlledMonth,
  onChangeMonth,
}) {
  const [selectedMonth, setSelectedMonth] = useState(
    controlledMonth || "2025-09"
  );
  const [stats, setStats] = useState(null);
  const [conversionStats, setConversionStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const SPREADSHEET_ID =
    spreadsheetId || "1rWrkTM6Mh0bkwUpk1VsF3ReGkOk-piIoHDeCobSDHKY";
  const CONVERSION_SPREADSHEET_ID =
    "195gQV7QzJ-uoKzqGVapMdF5-zAWQyzuF_I8ffkNGc-o";
  const months = ["2025-09"]; // keep in sync with FreeSignup

  // keep local month in sync if parent controls it
  useEffect(() => {
    if (controlledMonth && controlledMonth !== selectedMonth) {
      setSelectedMonth(controlledMonth);
    }
  }, [controlledMonth, selectedMonth]);

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
      return null;
    }
  };

  const cacheData = (monthKey, data) => {
    try {
      const timestamp = new Date().getTime();
      const cacheKey = `signup-stats-${monthKey}`;
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
    } catch (e) {}
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

  useEffect(() => {
    if (!selectedMonth) return;
    
    const cachedStats = getCachedData(selectedMonth);
    if (cachedStats) {
      setStats(cachedStats);
      setError(null);
    }

    // Load cached conversion to avoid late sales display
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

        // Fetch both freesignup and conversion data with retry logic
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

  const normalizeLanguage = (lang) => {
    if (!lang) return "Other";
    const value = String(lang).trim().toLowerCase();
    if (!value || value === "not selected" || value === "not provided")
      return "Other";
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

  const processForAssignee = (assignee) => {
    if (!stats || !stats.contacts) return null;
    const normAssignee = (assignee || "").trim().toLowerCase();
    const filteredContacts = stats.contacts.filter(
      (c) => (c.assignedTo || "").trim().toLowerCase() === normAssignee
    );
    const totalContacts = filteredContacts.length;

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

    // Demo metrics (strict mapping like in FreeSignup)
    let demoRequested = 0;
    let demoDeclined = 0;
    let demoCompleted = 0;

    // Calculate demo stats by reading actual spreadsheet data
    filteredContacts.forEach((contact) => {
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

      if (requested) demoRequested += 1;
      if (declined) demoDeclined += 1;
      if (completed) demoCompleted += 1;
    });

    // Calculate sales by matching with conversion data
    let salesCount = 0;
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
            const d = new Date(matchedContact.timestamp);
            const day = d.getDate();
            salesByDate[day] = (salesByDate[day] || 0) + 1;
            // Debug log for sales attribution per assignee
            console.log(
              "[FreeSignupCompare] Matched sale for assignee",
              assignee,
              {
                sale,
                matchedContact: {
                  name: matchedContact.name,
                  email: matchedContact.email,
                  phone: matchedContact.phone,
                  assignedTo: matchedContact.assignedTo,
                },
                day,
              }
            );
          }
        }
      });
    }

    // Calculate all the rate metrics like in FreeSignup
    const conversionRate =
      totalContacts > 0 ? Math.round((salesCount / totalContacts) * 100) : 0;
    const demoCompletionRate =
      demoRequested > 0 ? Math.round((demoCompleted / demoRequested) * 100) : 0;
    const salesFromCompletedRate =
      demoCompleted > 0 ? Math.round((salesCount / demoCompleted) * 100) : 0;
    const overallSalesFromRequestsRate =
      demoRequested > 0 ? Math.round((salesCount / demoRequested) * 100) : 0;

    const languageCount = {};
    const contactsByDate = {};

    filteredContacts.forEach((contact) => {
      const date = new Date(contact.timestamp);
      const day = date.getDate();
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

      // Use the same logic as above for demo stats
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

      const requested = strictYes(reqField);
      const declined = strictNo(reqField);
      const completed = requested && strictYes(statusField);

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

    const sortedLanguages = Object.entries(languageCount)
      .sort(([, a], [, b]) => b - a)
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

    const dailyData = Object.values(contactsByDate)
      .sort((a, b) => a.day - b.day)
      .map((day) => ({
        ...day,
        // Per-day sales conversion (using demoCompleted for the day)
        conversionRate:
          day.demoRequested > 0
            ? ((salesByDate[day.day] || 0) / day.demoRequested) * 100
            : 0,
        demoCompleted: day.demoCompleted,
        ...Object.fromEntries(
          Object.keys(sortedLanguages).map((l) => [l, day[l] || 0])
        ),
      }));

    return {
      totalContacts,
      demoRequested,
      demoCompleted,
      demoDeclined,
      salesCount,
      demoNo: demoDeclined, // Keep for backward compatibility
      conversionRate,
      demoCompletionRate,
      salesFromCompletedRate,
      overallSalesFromRequestsRate,
      languages: sortedLanguages,
      dailyData,
    };
  };

  const sowmya = useMemo(
    () => processForAssignee("Sowmya"),
    [stats, conversionStats]
  );
  const sukaina = useMemo(
    () => processForAssignee("Sukaina"),
    [stats, conversionStats]
  );

  const SimpleStatCard = ({ title, value, subvalue, isCritical = false }) => (
    <div className="bg-white text-gray-800 p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow h-24 flex flex-col justify-center">
      <h3 className="text-[10px] sm:text-xs font-semibold tracking-wide text-gray-500 mb-1 uppercase">
        {title}
      </h3>
      <div
        className={`flex items-baseline gap-2 ${
          isCritical ? "text-red-600" : ""
        }`}
      >
        <div className="text-xl sm:text-2xl font-bold flex items-center gap-2">
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
        {subvalue && (
          <div className="text-[11px] sm:text-xs text-gray-500 font-medium">
            {subvalue}
          </div>
        )}
      </div>
    </div>
  );

  const AllStatsCards = ({ data, assigneeName }) => {
    if (!data) return null;

    return (
      <>
        {/* First row - 5 main metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <SimpleStatCard title="Total Contacts" value={data.totalContacts} />
          <SimpleStatCard title="Demo Request" value={data.demoRequested} />
          <SimpleStatCard title="Demo Complete" value={data.demoCompleted} />
          <SimpleStatCard title="Demo Declined" value={data.demoDeclined} />
          <SimpleStatCard
            title="Sales"
            value={data.salesCount}
            subvalue={`${data.conversionRate}%`}
            isCritical={data.conversionRate < 5}
          />
        </div>
        
        {/* Second row - 3 rate metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <SimpleStatCard
            title="Demo Completion Rate"
            value={`${data.demoCompletionRate}%`}
            isCritical={data.demoCompletionRate < 5}
          />
          <SimpleStatCard
            title="Sales Conversion from Completed Demos"
            value={`${data.salesFromCompletedRate}%`}
            isCritical={data.salesFromCompletedRate < 5}
          />
          <SimpleStatCard
            title="Overall Sales Conversion from Demo Requests"
            value={`${data.overallSalesFromRequestsRate}%`}
            isCritical={data.overallSalesFromRequestsRate < 5}
          />
        </div>
      </>
    );
  };

  if (loading && !stats) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-4 sm:p-6 bg-gray-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          FREE SIGNUP — COMPARE
        </h1>
        <div className="w-full sm:w-auto">
          <select
            value={selectedMonth}
            onChange={(e) => {
              const val = e.target.value;
              if (onChangeMonth) onChangeMonth(val);
              setSelectedMonth(val);
            }}
            className="w-full sm:w-auto border px-3 py-2 rounded-lg bg-white shadow-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Sowmya Column */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold">Sowmya</h2>
            {sowmya && (
              <div className="flex items-center gap-2">
                {sowmya.totalContacts > 20 && (
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded">
                    +5%
                  </span>
                )}
                
              </div>
            )}
          </div>
          <AllStatsCards data={sowmya} assigneeName="Sowmya" />
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800">
              DAILY LEAD GENERATION
            </h3>
            <div className="h-64 lg:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sowmya?.dailyData || []}>
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
        </div>

        {/* Sukaina Column */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold">Sukaina</h2>
            {sukaina && (
              <div className="flex items-center gap-2">
                {sukaina.totalContacts > 20 && (
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded">
                    +5%
                  </span>
                )}
                
              </div>
            )}
          </div>
          <AllStatsCards data={sukaina} assigneeName="Sukaina" />
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800">
              DAILY LEAD GENERATION
            </h3>
            <div className="h-64 lg:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sukaina?.dailyData || []}>
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
        </div>
      </div>

      {/* AI Recommendation Cards */}
      <AIRecommendationCards
        dashboardType="compare"
        data={{ sowmya, sukaina }}
        month={selectedMonth}
      />
    </div>
  );
}
