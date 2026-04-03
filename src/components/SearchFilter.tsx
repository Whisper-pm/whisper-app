"use client";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  riskFilter: string;
  onRiskChange: (v: string) => void;
  sortBy: string;
  onSortChange: (v: string) => void;
}

export function SearchFilter({ search, onSearchChange, riskFilter, onRiskChange, sortBy, onSortChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search markets..."
        className="flex-1 min-w-[200px] bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-600 outline-none"
      />
      <select
        value={riskFilter}
        onChange={(e) => onRiskChange(e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
      >
        <option value="all">All Risk</option>
        <option value="LOW">Low Risk</option>
        <option value="MEDIUM">Medium Risk</option>
        <option value="HIGH">High Risk</option>
      </select>
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
      >
        <option value="score">AI Score</option>
        <option value="volume">Volume</option>
        <option value="time">Ending Soon</option>
        <option value="odds">Odds (50/50)</option>
      </select>
    </div>
  );
}
