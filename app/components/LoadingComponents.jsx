import React from "react";

export const FreeSignupLoading = () => (
  <div className="p-6 bg-gray-100 min-h-screen">
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-800">
        FREE SIGNUP ANALYTICS DASHBOARD
      </h1>
    </div>
    
    {/* Loading skeleton for stat cards */}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white p-3 rounded-lg shadow-md border border-gray-200 animate-pulse">
          <div className="h-3 bg-gray-200 rounded mb-2"></div>
          <div className="h-6 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>

    {/* Loading skeleton for rate cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white p-3 rounded-lg shadow-md border border-gray-200 animate-pulse">
          <div className="h-3 bg-gray-200 rounded mb-2"></div>
          <div className="h-6 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>

    {/* Loading skeleton for charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-lg shadow-lg animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="h-80 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

export const FreeSignupCompareLoading = () => (
  <div className="p-4 sm:p-6 bg-gray-100 min-h-screen">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
        FREE SIGNUP — COMPARE
      </h1>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* Sowmya Column Loading */}
      <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-6 bg-gray-200 rounded w-20 animate-pulse"></div>
        </div>
        
        {/* Loading skeleton for stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 animate-pulse">
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
        
        {/* Loading skeleton for rate cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 animate-pulse">
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>

        {/* Loading skeleton for chart */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-3 sm:mb-4"></div>
          <div className="h-64 lg:h-80 bg-gray-200 rounded"></div>
        </div>
      </div>

      {/* Sukaina Column Loading */}
      <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-6 bg-gray-200 rounded w-20 animate-pulse"></div>
        </div>
        
        {/* Loading skeleton for stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 animate-pulse">
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
        
        {/* Loading skeleton for rate cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 animate-pulse">
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>

        {/* Loading skeleton for chart */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-3 sm:mb-4"></div>
          <div className="h-64 lg:h-80 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  </div>
);

export const WhatsAppLoading = () => (
  <div className="p-6 bg-gray-100 min-h-screen">
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-800">
        WHATSAPP ANALYTICS DASHBOARD
      </h1>
    </div>
    
    {/* Loading skeleton for stat cards */}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white p-3 rounded-lg shadow-md border border-gray-200 animate-pulse">
          <div className="h-3 bg-gray-200 rounded mb-2"></div>
          <div className="h-6 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>

    {/* Loading skeleton for charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-lg shadow-lg animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="h-80 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

export const ErrorBoundary = ({ error, resetError }) => (
  <div className="p-6 bg-gray-100 min-h-screen">
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <div className="text-red-600 mb-4">
        <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-red-600 mb-4">
          {error?.message || "An error occurred while loading the data"}
        </p>
        <button
          onClick={resetError}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  </div>
);
