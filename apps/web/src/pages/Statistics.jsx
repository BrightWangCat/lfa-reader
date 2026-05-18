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
} from "antd";
import { Pie } from "@ant-design/charts";
import api from "../services/api";
import ZipCodeMap from "../components/ZipCodeMap";
import { getVisibleDimensionEntries } from "./statisticsDimensions";
import diseases from "@shared/data/diseases.json";

const { Title, Text } = Typography;

const CATEGORIES = ["Negative", "Positive", "Positive L", "Positive I", "Positive L+I"];
const CATEGORY_COLORS = {
  "Negative": "#38a169",
  "Positive": "#c53030",
  "Positive L": "#e53e3e",
  "Positive I": "#dd6b20",
  "Positive L+I": "#805ad5",
};

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

const PIE_PALETTE = [
  "#2b6cb0", "#38a169", "#e53e3e", "#dd6b20", "#805ad5",
  "#d69e2e", "#319795", "#b83280", "#5a67d8", "#ed8936",
  "#4fd1c5", "#fc8181", "#90cdf4", "#fbd38d", "#c6f6d5",
];

const CATEGORY_ORDER = ["Infectious", "Cancer"];
const SPECIES_LABEL = { cat: "Cats", dog: "Dogs" };

export default function Statistics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedDiseaseId = searchParams.get("disease");
  const selectedDisease = useMemo(
    () => diseases.find((disease) => disease.id === selectedDiseaseId),
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

  const handleDiseaseSelect = (diseaseId) => {
    setSearchParams({ disease: diseaseId });
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
      <Title level={3} style={{ color: "#1a365d", marginBottom: 8 }}>
        Global Test Statistics
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
        Aggregated results from all users' tests with patient information
      </Text>

      {groupedDiseases.map(({ category, items }) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <Title level={4} style={{ color: "#2d3748", marginBottom: 16 }}>
            {category}
          </Title>
          <Row gutter={[16, 16]}>
            {items.map((disease) => {
              const isSelected = disease.id === selectedDisease?.id;

              return (
                <Col xs={24} sm={12} md={8} key={disease.id}>
                  <Card
                    hoverable
                    onClick={() => handleDiseaseSelect(disease.id)}
                    styles={{ body: { padding: 20 } }}
                    style={{
                      height: "100%",
                      borderColor: isSelected ? "#2b6cb0" : "#e2e8f0",
                      boxShadow: isSelected ? "0 0 0 2px rgba(43, 108, 176, 0.12)" : "none",
                    }}
                  >
                    <Title level={5} style={{ color: "#1a365d", margin: 0 }}>
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
            {CATEGORIES.map((cat) => (
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
          />

          {visibleDimensionEntries.map(([dimKey, dimLabel]) => (
            <DimensionSection
              key={dimKey}
              dimensionLabel={dimLabel}
              dimensionData={data.dimensions[dimKey]}
            />
          ))}

          <ZipCodeMapSection zipDimensionData={data.dimensions.area_code} />
        </>
      )}
    </div>
  );
}

// Aggregates the area_code dimension into the shape ZipCodeMap consumes.
// The backend renamed zip_code -> area_code, but the Columbus map GeoJSON
// is keyed by USPS zip so the variable name here stays 'zip'.
function ZipCodeMapSection({ zipDimensionData }) {
  const zipData = useMemo(() => {
    if (!zipDimensionData) return {};
    const result = {};
    for (const cat of PIE_CATEGORIES) {
      const dist = zipDimensionData[cat] || {};
      for (const [zip, count] of Object.entries(dist)) {
        if (!result[zip]) {
          result[zip] = Object.fromEntries(PIE_CATEGORIES.map((key) => [key, 0]));
        }
        result[zip][cat] = count;
      }
    }
    return result;
  }, [zipDimensionData]);

  if (Object.keys(zipData).length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ color: "#1a365d", marginBottom: 16 }}>
        Geographic Distribution (Columbus, OH)
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Click on a zip code area to view positive case details
      </Text>
      <ZipCodeMap zipData={zipData} />
    </div>
  );
}

const PIE_CATEGORIES = CATEGORIES.filter((cat) => cat !== "Negative");
const TEMPERATURE_COLOR = "#2b6cb0";

function WeeklyTrendChart({ weeklyTrends = [], temperatureError }) {
  if (!weeklyTrends.length) return null;

  const temperatureData = weeklyTrends
    .filter((week) => week.avg_temperature_f !== null && week.avg_temperature_f !== undefined)
    .map((week) => ({
      week: week.label,
      temperature: week.avg_temperature_f,
    }));

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4} style={{ color: "#1a365d", marginBottom: 8 }}>
        Weekly Positive Results and Columbus Temperature
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Last 12 Sunday-Saturday weeks, Columbus, OH average temperature in °F
      </Text>
      <Card styles={{ body: { padding: "16px 16px 10px" } }}>
        <WeeklyTrendSvg
          weeklyTrends={weeklyTrends}
          temperatureData={temperatureData}
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

function WeeklyTrendSvg({ weeklyTrends, temperatureData }) {
  const width = 720;
  const height = 320;
  const margin = { top: 24, right: 58, bottom: 48, left: 46 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const plotBottom = margin.top + plotHeight;
  const maxCount = Math.max(
    1,
    ...weeklyTrends.flatMap((week) =>
      PIE_CATEGORIES.map((category) => week.positive_counts?.[category] || 0)
    )
  );
  const temperatures = temperatureData.map((point) => point.temperature);
  const hasTemperature = temperatures.length > 0;
  const minTemperature = hasTemperature ? Math.min(...temperatures) : 0;
  const maxTemperature = hasTemperature ? Math.max(...temperatures) : 1;
  const tempPadding = Math.max((maxTemperature - minTemperature) * 0.15, 2);
  const tempMin = minTemperature - tempPadding;
  const tempMax = maxTemperature + tempPadding;
  const xStep = plotWidth / weeklyTrends.length;
  const groupWidth = xStep * 0.66;
  const barWidth = groupWidth / PIE_CATEGORIES.length;
  const gridLines = [0, 1, 2, 3, 4];
  const temperatureByWeek = new Map(
    temperatureData.map((point) => [point.week, point.temperature])
  );

  const xCenter = (weekIndex) => margin.left + xStep * weekIndex + xStep / 2;
  const countY = (count) => plotBottom - (count / maxCount) * plotHeight;
  const temperatureY = (temperature) =>
    plotBottom - ((temperature - tempMin) / (tempMax - tempMin)) * plotHeight;

  const linePoints = weeklyTrends
    .map((week, index) => {
      const temperature = temperatureByWeek.get(week.label);
      if (temperature === undefined) return null;
      return `${xCenter(index)},${temperatureY(temperature)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
        {PIE_CATEGORIES.map((category) => (
          <LegendItem key={category} color={CATEGORY_COLORS[category]} label={category} />
        ))}
        {hasTemperature && (
          <LegendItem color={TEMPERATURE_COLOR} label="Avg Temp °F" line />
        )}
      </div>
      <svg
        role="img"
        aria-label="Weekly positive result counts and Columbus average temperature"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <text x={margin.left} y={14} fill="#718096" fontSize="12">Positive tests</text>
        {hasTemperature && (
          <text x={width - margin.right + 4} y={14} fill="#718096" fontSize="12">°F</text>
        )}
        {gridLines.map((line) => {
          const ratio = line / (gridLines.length - 1);
          const y = margin.top + ratio * plotHeight;
          const countLabel = Math.round(maxCount * (1 - ratio));
          const tempLabel = tempMax - (tempMax - tempMin) * ratio;
          return (
            <g key={line}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke="#edf2f7"
              />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" fill="#718096" fontSize="11">
                {countLabel}
              </text>
              {hasTemperature && (
                <text x={width - margin.right + 10} y={y + 4} fill="#718096" fontSize="11">
                  {tempLabel.toFixed(0)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={margin.left} x2={margin.left} y1={margin.top} y2={plotBottom} stroke="#cbd5e0" />
        <line x1={margin.left} x2={width - margin.right} y1={plotBottom} y2={plotBottom} stroke="#cbd5e0" />

        {weeklyTrends.map((week, weekIndex) => {
          const groupX = xCenter(weekIndex) - groupWidth / 2;
          return (
            <g key={week.week_start}>
              {PIE_CATEGORIES.map((category, categoryIndex) => {
                const count = week.positive_counts?.[category] || 0;
                const x = groupX + categoryIndex * barWidth;
                const y = countY(count);
                const barHeight = plotBottom - y;
                return (
                  <rect
                    key={category}
                    x={x}
                    y={y}
                    width={Math.max(barWidth - 2, 1)}
                    height={barHeight}
                    rx="2"
                    fill={CATEGORY_COLORS[category]}
                  />
                );
              })}
              <text
                x={xCenter(weekIndex)}
                y={plotBottom + 20}
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
            <polyline
              points={linePoints}
              fill="none"
              stroke={TEMPERATURE_COLOR}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {weeklyTrends.map((week, index) => {
              const temperature = temperatureByWeek.get(week.label);
              if (temperature === undefined) return null;
              return (
                <circle
                  key={week.week_start}
                  cx={xCenter(index)}
                  cy={temperatureY(temperature)}
                  r="4"
                  fill={TEMPERATURE_COLOR}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              );
            })}
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

function DimensionSection({ dimensionLabel, dimensionData }) {
  if (!dimensionData) return null;

  const hasData = PIE_CATEGORIES.some(
    (cat) => dimensionData[cat] && Object.keys(dimensionData[cat]).length > 0
  );

  if (!hasData) {
    return (
      <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ color: "#1a365d", marginBottom: 16 }}>
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
      <Title level={4} style={{ color: "#1a365d", marginBottom: 16 }}>
        {dimensionLabel}
      </Title>
      <Row gutter={[16, 16]}>
        {PIE_CATEGORIES.map((cat) => {
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
                  <CategoryPieChart entries={entries} total={total} />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}

function CategoryPieChart({ entries, total }) {
  const chartData = entries.map(([label, count]) => ({
    type: label,
    value: count,
  }));

  const config = {
    data: chartData,
    angleField: "value",
    colorField: "type",
    color: PIE_PALETTE,
    radius: 0.85,
    innerRadius: 0.55,
    height: 240,
    label: {
      text: (d) => {
        const pct = ((d.value / total) * 100).toFixed(1);
        return pct >= 5 ? `${pct}%` : "";
      },
      style: { fontSize: 11, fontWeight: 500 },
    },
    legend: {
      color: {
        position: "bottom",
        layout: { justifyContent: "center" },
        itemLabelFontSize: 11,
        maxRows: 3,
      },
    },
    tooltip: {
      title: "type",
      items: [
        {
          field: "value",
          name: "Count",
        },
      ],
    },
    animate: false,
  };

  return <Pie {...config} />;
}
