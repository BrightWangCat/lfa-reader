import { useState, useEffect, useMemo } from "react";
import { Alert, Radio, Spin, Typography } from "antd";
import diseases from "@shared/data/diseases.json";
import ZipCodeMap from "../components/ZipCodeMap";
import { getMapStats } from "../services/api";
import { isDiseaseUnderDevelopment } from "../utils/diseaseAvailability";

const { Title, Text } = Typography;

// The map endpoint only returns one aggregate positive count per area code,
// so the map renders a single "Positive" series regardless of workflow.
const MAP_CATEGORY = "Positive";
const MAP_CATEGORY_COLOR = { [MAP_CATEGORY]: "#BF3E2B" };

// The map is always viewed per disease workflow; there is no combined view.
const ACTIVE_DISEASES = diseases.filter((d) => !isDiseaseUnderDevelopment(d.id));

export default function CommunityMap() {
  const [filter, setFilter] = useState(ACTIVE_DISEASES[0]?.label);
  // The response is stored together with the filter it answers, so switching
  // filters derives the loading state instead of setting it inside the effect.
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMapStats(filter)
      .then((res) => {
        if (!cancelled) setResult({ filter, data: res.data });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            filter,
            error: err.response?.data?.detail || "Failed to load map data",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const current = result && result.filter === filter ? result : null;
  const loading = !current;
  const data = current?.data;
  const error = current?.error || "";

  const zipData = useMemo(() => {
    const counts = data?.positive_by_area_code || {};
    return Object.fromEntries(
      Object.entries(counts).map(([zip, count]) => [
        zip,
        { [MAP_CATEGORY]: count },
      ])
    );
  }, [data]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <Title level={3} style={{ color: "var(--ink-strong)", marginBottom: 4 }}>
        Community Map
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 16, lineHeight: 1.5 }}
      >
        Positive cases around Columbus, OH, aggregated by ZIP code from
        anonymized results. No individual records are shown.
      </Text>

      <Radio.Group
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        optionType="button"
        buttonStyle="solid"
        style={{ marginBottom: 16 }}
        options={ACTIVE_DISEASES.map((d) => ({ value: d.label, label: d.label }))}
      />

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem" }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 12, fontSize: 13 }}
          >
            {data?.total_positive || 0} positive result
            {(data?.total_positive || 0) === 1 ? "" : "s"} in total for this
            selection.
          </Text>
          <ZipCodeMap
            zipData={zipData}
            positiveCategories={[MAP_CATEGORY]}
            categoryColors={MAP_CATEGORY_COLOR}
          />
        </>
      )}
    </div>
  );
}
