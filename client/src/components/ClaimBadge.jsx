import React from "react";
import { CheckCircle2, HelpCircle, TrendingUp, MinusCircle } from "lucide-react";

export function ClaimBadge({ type }) {
  const getBadgeConfig = (category) => {
    switch (category) {
      case "FACTUAL":
        return {
          label: "Factual Claim",
          className: "badge-factual",
          icon: <CheckCircle2 size={14} />,
        };
      case "OPINION":
        return {
          label: "Opinion",
          className: "badge-opinion",
          icon: <HelpCircle size={14} />,
        };
      case "PREDICTION":
        return {
          label: "Prediction",
          className: "badge-prediction",
          icon: <TrendingUp size={14} />,
        };
      case "NON_CLAIM":
      default:
        return {
          label: "Non-Claim",
          className: "badge-nonclaim",
          icon: <MinusCircle size={14} />,
        };
    }
  };

  const { label, className, icon } = getBadgeConfig(type);

  return (
    <span className={`claim-badge ${className}`}>
      {icon}
      <span>{label}</span>
    </span>
  );
}
