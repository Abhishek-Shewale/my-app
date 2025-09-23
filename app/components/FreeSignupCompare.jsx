"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Bar, Line } from "recharts";

export default function FreeSignupCompare({
  spreadsheetId,
  month: controlledMonth,
  onChangeMonth,
}) {
  const [selectedMonth, setSelectedMonth] = useState(controlledMonth || "2025-09");
  const [stats, setStats] = useState(null);
  const [conversionStats, setConversionStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const SPREADSHEET_ID =
    spreadsheetId || "1rWrkTM6Mh0bkwUpk1VsF3ReGkOk-piIoHDeCobSDHKY";
  const CONVERSION_SPREADSHEET_ID = "195gQV7QzJ-uoKzqGVapMdF5-zAWQyzuF_I8ffkNGc-o";
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

    const fetchStats = async () => {
      try {
        // Fetch both freesignup and conversion data
        const [freeSignupRes, conversionRes] = await Promise.all([
          fetch(
            new URL("/api/freesignupsheet", window.location.origin).toString() +
            "?" +
            new URLSearchParams({
              spreadsheetId: SPREADSHEET_ID,
              monthYear: selectedMonth.split("-")[1] + "-" + selectedMonth.split("-")[0],
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

        if (!freeSignupRes.ok) throw new Error(`FreeSignup API error ${freeSignupRes.status}`);
        if (!conversionRes.ok) throw new Error(`Conversion API error ${conversionRes.status}`);

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
          // eslint-disable-next-line no-console
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    return () => controller.abort();
  }, [selectedMonth, SPREADSHEET_ID, CONVERSION_SPREADSHEET_ID]);

  const normalizeLanguage = (lang) => {
    if (!lang) return "Other";
    const value = String(lang).trim().toLowerCase();
    if (!value || value === "not selected" || value === "not provided") return "Other";
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
    const filteredContacts = stats.contacts.filter((c) => ((c.assignedTo || "").trim().toLowerCase()) === normAssignee);
    const totalContacts = filteredContacts.length;

    // For free signup, everyone accepts demo and completes it
    const demoRequested = totalContacts;
    const demoCompleted = totalContacts;
    const demoDeclined = 0;
    
    // Calculate sales by matching with conversion data
    let salesCount = 0;
    const salesByDate = {};
    const seenSaleKeys = new Set();
    
    if (conversionStats && conversionStats.data) {
      // Create lookup maps for faster matching
      const freeSignupByEmail = new Map();
      const freeSignupByContact = new Map();
      
      filteredContacts.forEach(contact => {
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
      conversionStats.data.forEach(sale => {
        let matchedContact = null;
        
        // Try email match first
        if (sale.email) {
          matchedContact = freeSignupByEmail.get(sale.email.toLowerCase().trim());
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
            (matchedContact.email && matchedContact.email.toLowerCase().trim()) ||
            (matchedContact.phone && normalizeContact(matchedContact.phone)) ||
            Math.random().toString(36);
          if (!seenSaleKeys.has(uniqueKey)) {
            seenSaleKeys.add(uniqueKey);
            salesCount++;
            const d = new Date(matchedContact.timestamp);
            const day = d.getDate();
            salesByDate[day] = (salesByDate[day] || 0) + 1;
            // Debug log for sales attribution per assignee
            console.log("[FreeSignupCompare] Matched sale for assignee", assignee, {
              sale,
              matchedContact: {
                name: matchedContact.name,
                email: matchedContact.email,
                phone: matchedContact.phone,
                assignedTo: matchedContact.assignedTo,
              },
              day,
            });
          }
        }
      });
    }
    
    // Conversion rate = Sales / Total Contacts (%), rounded
    const conversionRate = totalContacts > 0 ? Math.round((salesCount / totalContacts) * 100) : 0;

    const languageCount = {};
    const contactsByDate = {};

    filteredContacts.forEach((contact) => {
      const date = new Date(contact.timestamp);
      const day = date.getDate();
      if (!contactsByDate[day]) {
        contactsByDate[day] = { day, totalContacts: 0, demoRequested: 0, demoNo: 0 };
      }
      contactsByDate[day].totalContacts += 1;
      if (
        contact.demoStatus &&
        (contact.demoStatus.toLowerCase().includes("scheduled") || contact.demoStatus.toLowerCase().includes("completed"))
      ) {
        contactsByDate[day].demoRequested += 1;
      } else {
        contactsByDate[day].demoNo += 1;
      }
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
        // Per-day sales conversion
        conversionRate: day.totalContacts > 0 ? ((salesByDate[day.day] || 0) / day.totalContacts) * 100 : 0,
        demoCompleted: day.totalContacts,
        ...Object.fromEntries(Object.keys(sortedLanguages).map((l) => [l, day[l] || 0])),
      }));

    return {
      totalContacts,
      demoRequested,
      demoCompleted,
      demoDeclined,
      salesCount,
      demoNo: demoDeclined, // Keep for backward compatibility
      conversionRate,
      languages: sortedLanguages,
      dailyData,
    };
  };

  const sowmya = useMemo(() => processForAssignee("Sowmya"), [stats, conversionStats]);
  const sukaina = useMemo(() => processForAssignee("Sukaina"), [stats, conversionStats]);

  const SimpleStatCard = ({ title, value, subvalue }) => (
    <div className="bg-white text-gray-800 p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <h3 className="text-[10px] sm:text-xs font-semibold tracking-wide text-gray-500 mb-1 uppercase">
        {title}
      </h3>
      <div className="flex items-baseline gap-2">
        <div className="text-xl sm:text-2xl font-bold">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {subvalue ? (
          <div className="text-[11px] sm:text-xs text-gray-500 font-medium">{subvalue}</div>
        ) : null}
      </div>
    </div>
  );

  const TopFive = ({ data }) => {
    if (!data) return null;
    const topLanguages = Object.entries(data.languages || {}).slice(0, 1); // Only show 1 language to fit 5 cards
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SimpleStatCard title="Total Contacts" value={data.totalContacts} />
        <SimpleStatCard title="Demo Request" value={data.demoRequested} />
        <SimpleStatCard title="Demo Complete" value={data.demoCompleted} />
        <SimpleStatCard title="Demo Declined" value={data.demoDeclined} />
        <SimpleStatCard title="Sales" value={data.salesCount} />
      </div>
    );
  };

  if (loading && !stats) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-4 sm:p-6 bg-gray-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">FREE SIGNUP — COMPARE</h1>
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
          <h2 className="text-base sm:text-lg font-semibold mb-3">Sowmya</h2>
          <TopFive data={sowmya} />
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800">DAILY LEAD GENERATION</h3>
            <div className="h-64 lg:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sowmya?.dailyData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Bar yAxisId="left" dataKey="totalContacts" fill="#93c5fd" name="Total Contacts" />
                  <Bar yAxisId="left" dataKey="demoRequested" fill="#86efac" name="Demo Requested" />
                  <Line yAxisId="right" type="monotone" dataKey="conversionRate" stroke="#60a5fa" strokeWidth={2} dot={{ fill: "#60a5fa", r: 3 }} name="Conversion Rate (%)" />
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
        </div>

        {/* Sukaina Column */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3">Sukaina</h2>
          <TopFive data={sukaina} />
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800">DAILY LEAD GENERATION</h3>
            <div className="h-64 lg:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sukaina?.dailyData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Bar yAxisId="left" dataKey="totalContacts" fill="#93c5fd" name="Total Contacts" />
                  <Bar yAxisId="left" dataKey="demoRequested" fill="#86efac" name="Demo Requested" />
                  <Line yAxisId="right" type="monotone" dataKey="conversionRate" stroke="#60a5fa" strokeWidth={2} dot={{ fill: "#60a5fa", r: 3 }} name="Conversion Rate (%)" />
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
        </div>
      </div>
    </div>
  );
}
