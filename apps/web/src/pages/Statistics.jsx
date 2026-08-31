import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Spin,
  Alert,
  Empty,
  Tag,
  App,
} from "antd";
import api from "../services/api";
import ZipCodeMap from "../components/ZipCodeMap";
import {
  CATEGORY_COLORS,
  getStatisticsCategoryConfig,
} from "./statisticsCategories";
import { getVisibleDimensionEntries } from "./statisticsDimensions";
import {
  isDiseaseUnderDevelopment,
  UNDER_DEVELOPMENT_NOTICE,
} from "../utils/diseaseAvailability";
import diseases from "@shared/data/diseases.json";

const { Title, Text } = Typography;

// Dimensions surfaced in the per-dimension pie grid. Keep in sync with
// PATIENT_DIMENSIONS in apps/backend/app/routers/stats.py.
const DIMENSION_LABELS = {
  disease_category: "Disease Category",
  species: "Species",
  age: "Age",
  sex: "Sex",
  breed: "Breed",
  area_code: "Area Code",
  preventive_treatment: "Preventive Treatment (6mo)",
};

const CATEGORY_ORDER = ["Infectious", "Cancer"];
const SPECIES_LABEL = { cat: "Cats", dog: "Dogs" };

export default function Statistics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { modal } = App.useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedDiseaseId = searchParams.get("disease");
  const selectedDisease = useMemo(
    () =>
      isDiseaseUnderDevelopment(selectedDiseaseId)
        ? undefined
        : diseases.find((disease) => disease.id === selectedDiseaseId),
    [selectedDiseaseId]
  );
  const groupedDiseases = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: diseases.filter((disease) => disease.category === category),
      })),
    []
  );
  const visibleDimensionEntries = useMemo(
    () => getVisibleDimensionEntries(DIMENSION_LABELS, selectedDisease),
    [selectedDisease]
  );
  const categoryConfig = useMemo(
    () => getStatisticsCategoryConfig(selectedDisease?.id),
    [selectedDisease]
  );

  useEffect(() => {
    if (!selectedDisease) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }

    fetchGlobalStats(selectedDisease.label);
  }, [selectedDisease]);

  const fetchGlobalStats = async (diseaseFilter) => {
    setLoading(true);
    setError("");
    try {
      const params = { disease_category: diseaseFilter };
      const res = await api.get("/api/stats/global", { params });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load statistics");
    } finally {
      setLoading(false);
    }
  };

  const handleDiseaseSelect = (disease) => {
    if (isDiseaseUnderDevelopment(disease.id)) {
      modal.info(UNDER_DEVELOPMENT_NOTICE);
      return;
    }

    setSearchParams({ disease: disease.id });
  };

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ maxWidth: 400, margin: "0 auto" }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Title level={3} style={{ color: "var(--ink-strong)", marginBottom: 8 }}>
        Statistics
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
        Aggregated results from all users' tests with patient information
      </Text>

      {groupedDiseases.map(({ category, items }) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <Title level={4} style={{ color: "var(--ink-strong)", marginBottom: 16 }}>
            {category}
          </Title>
          <Row gutter={[16, 16]}>
            {items.map((disease) => {
              const isSelected = disease.id === selectedDisease?.id;

              return (
                <Col xs={24} sm={12} md={8} key={disease.id}>
                  <Card
                    hoverable
                    onClick={() => handleDiseaseSelect(disease)}
                    styles={{ body: { padding: 20 } }}
                    style={{
                      height: "100%",
                      borderColor: isSelected ? "#2b6cb0" : "#e2e8f0",
                      boxShadow: isSelected ? "0 0 0 2px rgba(43, 108, 176, 0.12)" : "none",
                    }}
                  >
                    <Title level={5} style={{ color: "var(--ink-strong)", margin: 0 }}>
                      {disease.label}
                    </Title>
                    <div style={{ marginTop: 12 }}>
                      <Tag color={disease.species === "cat" ? "magenta" : "blue"}>
                        {SPECIES_LABEL[disease.species]}
                      </Tag>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      ))}

      {!selectedDisease ? (
        <Empty description="Select a disease workflow to view statistics." />
      ) : loading ? (
        <div style={{ textAlign: "center", padding: "4rem" }}>
          <Spin size="large" />
        </div>
      ) : !data || data.total === 0 ? (
        <Empty description="No test results with patient information available for this selection." />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
            <Col xs={12} sm={8} md={4}>
              <Card>
                <Statistic title="Total Samples" value={data.total} />
              </Card>
            </Col>
            {categoryConfig.resultCategories.map((cat) => (
              <Col xs={12} sm={8} md={5} key={cat}>
                <Card>
                  <Statistic
                    title={cat}
                    value={data.category_totals[cat] || 0}
                    valueStyle={{ color: CATEGORY_COLORS[cat] }}
                  />
                </Card>
              </Col>
            ))}
          </Row>

          <WeeklyTrendChart
            weeklyTrends={data.weekly_trends}
            temperatureError={data.temperature_error}
            positiveCategories={categoryConfig.positiveCategories}
          />

          {visibleDimensionEntries.map(([dimKey, dimLabel]) => (
            <DimensionSection
              key={dimKey}
              dimensionLabel={dimLabel}
              dimensionData={data.dimensions[dimKey]}
              positiveCategories={categoryConfig.positiveCategories}
            />
          ))}

          <ZipCodeMapSection
            zipDimensionData={data.dimensions.area_code}
            positiveCategories={categoryConfig.positiveCategories}
          />
        </>
      )}
    </div>
  );
}

// Aggregates the area_code dimension into the shape ZipCodeMap consumes.
// The backend renamed zip_code -> area_code, but the Columbus map GeoJSON
// is keyed by USPS zip so the variable name here stays 'zip'.
function ZipCodeMapSection({ zipDimensionData, positiveCategories }) {
  const zipData = useMemo(() => {
    if (!zipDimensionData) return {};
    const result = {};
    for (const cat of positiveCategories) {
      const dist = zipDimensionData[cat] || {};
      for (const [zip, count] of Object.entries(dist)) {
        if (!result[zip]) {
          result[zip] = Object.fromEntries(
            positiveCategories.map((key) => [key, 0])
          );
        }
        result[zip][cat] = count;
      }
    }
    return result;
  }, [positiveCategories, zipDimensionData]);

  if (Object.keys(zipData).length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ color: "var(--ink-strong)", marginBottom: 16 }}>
        Geographic Distribution (Columbus, OH)
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Click on a zip code area to view positive case details
      </Text>
      <ZipCodeMap
        zipData={zipData}
        positiveCategories={positiveCategories}
        categoryColors={CATEGORY_COLORS}
      />
    </div>
  );
}

const TEMPERATURE_COLOR = "#64748B";

function WeeklyTrendChart({
  weeklyTrends = [],
  temperatureError,
  positiveCategories,
}) {
  if (!weeklyTrends.length || positiveCategories.length === 0) return null;

  const temperatureData = weeklyTrends
    .filter((week) => week.avg_temperature_f !== null && week.avg_temperature_f !== undefined)
    .map((week) => ({
      week: week.label,
      temperature: week.avg_temperature_f,
    }));

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ color: "var(--ink-strong)", marginBottom: 8 }}>
        Weekly Positive Results and Columbus Temperature
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Last 12 Sunday-Saturday weeks, Columbus, OH average temperature in °F
      </Text>
      <Card styles={{ body: { padding: "16px 16px 10px" } }}>
        <WeeklyTrendSvg
          weeklyTrends={weeklyTrends}
          temperatureData={temperatureData}
          positiveCategories={positiveCategories}
        />
        {temperatureError && (
          <Alert
            type="warning"
            showIcon
            message={temperatureError}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>
    </div>
  );
}

// Positive counts and temperature render as two vertically aligned panels
// with separate scales; a single plot with two y axes misleads and is
// deliberately avoided.
function WeeklyTrendSvg({
  weeklyTrends,
  temperatureData,
  positiveCategories,
}) {
  const width = 720;
  const left = 46;
  const right = width - 16;
  const countTop = 22;
  const countBottom = 182;
  const labelY = 202;
  const tempTop = 234;
  const tempBottom = 282;
  const height = 296;

  const maxCount = Math.max(
    1,
    ...weeklyTrends.flatMap((week) =>
      positiveCategories.map(
        (category) => week.positive_counts?.[category] || 0
      )
    )
  );
  const temperatures = temperatureData.map((point) => point.temperature);
  const hasTemperature = temperatures.length > 0;
  const tempMin = hasTemperature ? Math.min(...temperatures) - 2 : 0;
  const tempMax = hasTemperature ? Math.max(...temperatures) + 2 : 1;
  const xStep = (right - left) / weeklyTrends.length;
  const groupWidth = xStep * 0.66;
  const barWidth = groupWidth / positiveCategories.length;
  const gridLines = [0, 1, 2];
  const temperatureByWeek = new Map(
    temperatureData.map((point) => [point.week, point.temperature])
  );

  const xCenter = (weekIndex) => left + xStep * weekIndex + xStep / 2;
  const countY = (count) =>
    countBottom - (count / maxCount) * (countBottom - countTop);
  const temperatureY = (temperature) =>
    tempBottom -
    ((temperature - tempMin) / (tempMax - tempMin || 1)) * (tempBottom - tempTop);

  const linePoints = weeklyTrends
    .map((week, index) => {
      const temperature = temperatureByWeek.get(week.label);
      if (temperature === undefined) return null;
      return `${xCenter(index)},${temperatureY(temperature)}`;
    })
    .filter(Boolean)
    .join(" ");
  const lastTemperatureWeek = [...weeklyTrends]
    .reverse()
    .find((week) => temperatureByWeek.get(week.label) !== undefined);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
        {positiveCategories.map((category) => (
          <LegendItem key={category} color={CATEGORY_COLORS[category]} label={category} />
        ))}
      </div>
      <svg
        role="img"
        aria-label="Weekly positive result counts with Columbus average temperature below"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <text x={left} y={12} fill="#718096" fontSize="12">Positive tests</text>
        {gridLines.map((line) => {
          const ratio = line / (gridLines.length - 1);
          const y = countTop + ratio * (countBottom - countTop);
          const countLabel = Math.round(maxCount * (1 - ratio));
          return (
            <g key={line}>
              <line x1={left} x2={right} y1={y} y2={y} stroke="#edf2f7" />
              <text x={left - 10} y={y + 4} textAnchor="end" fill="#718096" fontSize="11">
                {countLabel}
              </text>
            </g>
          );
        })}
        <line x1={left} x2={right} y1={countBottom} y2={countBottom} stroke="#cbd5e0" />

        {weeklyTrends.map((week, weekIndex) => {
          const groupX = xCenter(weekIndex) - groupWidth / 2;
          return (
            <g key={week.week_start}>
              {positiveCategories.map((category, categoryIndex) => {
                const count = week.positive_counts?.[category] || 0;
                const x = groupX + categoryIndex * barWidth;
                const y = countY(count);
                return (
                  <rect
                    key={category}
                    x={x}
                    y={y}
                    width={Math.max(barWidth - 2, 1)}
                    height={countBottom - y}
                    rx="2"
                    fill={CATEGORY_COLORS[category]}
                  />
                );
              })}
              <text
                x={xCenter(weekIndex)}
                y={labelY}
                textAnchor="middle"
                fill="#718096"
                fontSize="11"
              >
                {week.label}
              </text>
            </g>
          );
        })}

        {hasTemperature && linePoints && (
          <>
            <text x={left} y={tempTop - 10} fill="#718096" fontSize="12">
              Avg temp, Columbus
            </text>
            <polyline
              points={linePoints}
              fill="none"
              stroke={TEMPERATURE_COLOR}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {lastTemperatureWeek && (
              <text
                x={right - 2}
                y={temperatureY(temperatureByWeek.get(lastTemperatureWeek.label)) - 8}
                textAnchor="end"
                fill="#718096"
                fontSize="11"
              >
                {Math.round(temperatureByWeek.get(lastTemperatureWeek.label))}°F
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

function LegendItem({ color, label, line = false }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#4a5568", fontSize: 12 }}>
      <span
        style={{
          width: line ? 18 : 10,
          height: line ? 3 : 10,
          background: color,
          borderRadius: line ? 2 : 3,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function DimensionSection({
  dimensionLabel,
  dimensionData,
  positiveCategories,
}) {
  if (!dimensionData) return null;

  const hasData = positiveCategories.some(
    (cat) => dimensionData[cat] && Object.keys(dimensionData[cat]).length > 0
  );

  if (!hasData) {
    return (
      <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ color: "var(--ink-strong)", marginBottom: 16 }}>
          {dimensionLabel}
        </Title>
        <Empty
          description={`No ${dimensionLabel.toLowerCase()} data available`}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ color: "var(--ink-strong)", marginBottom: 16 }}>
        {dimensionLabel}
      </Title>
      <Row gutter={[16, 16]}>
        {positiveCategories.map((cat) => {
          const dist = dimensionData[cat] || {};
          const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
          const total = entries.reduce((sum, [, count]) => sum + count, 0);

          return (
            <Col xs={24} sm={12} md={8} key={cat}>
              <Card
                title={
                  <span style={{ color: CATEGORY_COLORS[cat], fontWeight: 600 }}>
                    {cat}
                    <span style={{ color: "#718096", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                      (n={total})
                    </span>
                  </span>
                }
                size="small"
                styles={{ body: { padding: "12px 16px" } }}
              >
                {entries.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#a0aec0" }}>
                    No data
                  </div>
                ) : (
                  <CategoryBarList
                    entries={entries}
                    total={total}
                    color={CATEGORY_COLORS[cat]}
                  />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}

// Sorted horizontal bars replace the former donut chart: shares compare by
// length on a common baseline, each row is labeled directly, and the whole
// list uses the parent category's single hue.
const BAR_LIST_LIMIT = 8;

function CategoryBarList({ entries, total, color }) {
  const shown = entries.slice(0, BAR_LIST_LIMIT);
  const restCount = entries
    .slice(BAR_LIST_LIMIT)
    .reduce((sum, [, count]) => sum + count, 0);
  const rows = restCount > 0 ? [...shown, ["Other", restCount]] : shown;
  const maxCount = Math.max(...rows.map(([, count]) => count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map(([label, count]) => (
        <div key={label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 3,
            }}
          >
            <span
              style={{
                color: "#4a5568",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginRight: 8,
              }}
            >
              {label}
            </span>
            <span style={{ color: "#718096", flexShrink: 0 }}>
              {count} · {((count / total) * 100).toFixed(0)}%
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "#f1f5f9",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(count / maxCount) * 100}%`,
                height: "100%",
                borderRadius: 4,
                background: color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
