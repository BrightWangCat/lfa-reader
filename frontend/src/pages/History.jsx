import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Table,
  Tag,
  Button,
  Space,
  Popconfirm,
  Typography,
  Alert,
  Empty,
  App,
} from "antd";
import {
  EyeOutlined,
  BarChartOutlined,
  DownloadOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import api, { API_BASE_URL } from "../services/api";

const { Title } = Typography;

// Status color and label mapping
const statusConfig = {
  completed: { color: "green", label: "Done" },
  running: { color: "gold", label: "Running" },
  queued: { color: "blue", label: "Queued" },
  failed: { color: "red", label: "Failed" },
};

export default function History() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const navigate = useNavigate();
  const { message } = App.useApp();

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const res = await api.get("/api/upload/batches");
      setBatches(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (batchId) => {
    setDeletingId(batchId);
    try {
      await api.delete(`/api/upload/batch/${batchId}`);
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete batch");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      align: "center",
      responsive: ["md"],
    },
    {
      title: "Batch Name",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      render: (name) =>
        name || (
          <Typography.Text type="secondary">Untitled</Typography.Text>
        ),
    },
    {
      title: "Images",
      dataIndex: "total_images",
      key: "images",
      width: 70,
      align: "center",
    },
    {
      title: "Status",
      dataIndex: "reading_status",
      key: "status",
      width: 90,
      align: "center",
      render: (status) => {
        const config = statusConfig[status];
        return config ? (
          <Tag color={config.color}>{config.label}</Tag>
        ) : (
          <Typography.Text type="secondary">--</Typography.Text>
        );
      },
    },
    {
      title: "Uploaded Time",
      dataIndex: "created_at",
      key: "date",
      width: 230,
      responsive: ["lg"],
      render: (date) => formatDate(date),
    },
    {
      title: "Uploaded By",
      dataIndex: "username",
      key: "user",
      width: 120,
      responsive: ["md"],
      render: (u) => u || "Unknown",
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/results?batch=${record.id}`)}
          >
            View
          </Button>
          {record.total_images > 1 && (
            <>
              <Button
                size="small"
                icon={<BarChartOutlined />}
                onClick={() => navigate(`/stats?batch=${record.id}`)}
              >
                Stats
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                href={`${API_BASE_URL}/api/export/batch/${record.id}/excel?token=${localStorage.getItem("token")}`}
              >
                Export
              </Button>
            </>
          )}
          <Popconfirm
            title="Delete this batch?"
            description="This will delete all images and cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okType="danger"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingId === record.id}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={3} style={{ color: "#1a365d", margin: 0 }}>
          Test Results
        </Title>
        <Link to="/upload">
          <Button type="primary" icon={<PlusOutlined />}>
            New Test
          </Button>
        </Link>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        columns={columns}
        dataSource={batches}
        rowKey="id"
        loading={loading}
        scroll={{ x: 500 }}
        locale={{
          emptyText: (
            <Empty description="No test results yet.">
              <Link to="/upload">
                <Button type="primary">Start your first test</Button>
              </Link>
            </Empty>
          ),
        }}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
