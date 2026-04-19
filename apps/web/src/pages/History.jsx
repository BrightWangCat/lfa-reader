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
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { listImages, deleteImage } from "../services/api";

const { Title } = Typography;

const statusConfig = {
  completed: { color: "green", label: "Done" },
  running: { color: "gold", label: "Running" },
  failed: { color: "red", label: "Failed" },
};

export default function History() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const navigate = useNavigate();
  const { message } = App.useApp();

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      const res = await listImages();
      setImages(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (imageId) => {
    setDeletingId(imageId);
    try {
      await deleteImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete image");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const renderResultTag = (record) => {
    const final = record.manual_correction || record.cv_result;
    if (final) {
      const isCorrected = !!record.manual_correction;
      return (
        <Tag color={isCorrected ? "green" : "blue"}>
          {final}
          {isCorrected && " ✓"}
        </Tag>
      );
    }
    return <Typography.Text type="secondary">--</Typography.Text>;
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
      title: "Filename",
      dataIndex: "original_filename",
      key: "filename",
      ellipsis: true,
    },
    {
      title: "Disease",
      dataIndex: "disease_category",
      key: "disease",
      width: 170,
      responsive: ["md"],
      render: (d) =>
        d ? (
          <Tag color="geekblue">{d}</Tag>
        ) : (
          <Typography.Text type="secondary">--</Typography.Text>
        ),
    },
    {
      title: "Result",
      key: "result",
      width: 130,
      align: "center",
      render: (_, record) => renderResultTag(record),
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
      width: 160,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/results?image=${record.id}`)}
          >
            View
          </Button>
          <Popconfirm
            title="Delete this image?"
            description="This cannot be undone."
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
        <Link to="/">
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
        dataSource={images}
        rowKey="id"
        loading={loading}
        scroll={{ x: 500 }}
        locale={{
          emptyText: (
            <Empty description="No test results yet.">
              <Link to="/">
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
