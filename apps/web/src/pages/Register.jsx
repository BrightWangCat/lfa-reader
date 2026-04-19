import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, App } from "antd";
import { MailOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";

const { Title, Text } = Typography;

export default function Register() {
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      await register(values.email, values.username, values.password);
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      message.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f4f8",
      }}
    >
      <Card
        style={{ width: "100%", maxWidth: 400 }}
        styles={{ body: { padding: "2.5rem 2rem" } }}
      >
        <Title
          level={3}
          style={{ textAlign: "center", color: "#1a365d", marginBottom: 4 }}
        >
          Create Account
        </Title>
        <Text
          type="secondary"
          style={{ display: "block", textAlign: "center", marginBottom: 32 }}
        >
          LFA Reader
        </Text>

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Please enter your email" },
              { type: "email", message: "Please enter a valid email" },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="Email"
              autoFocus
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: "Please enter a username" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Username"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: "Please enter a password" },
              { min: 6, message: "Password must be at least 6 characters" },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Please confirm your password" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error("Passwords do not match")
                  );
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Confirm password"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
            >
              Create account
            </Button>
          </Form.Item>
        </Form>

        <Text
          type="secondary"
          style={{ display: "block", textAlign: "center", marginTop: 24 }}
        >
          Already have an account?{" "}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </Text>
      </Card>
    </div>
  );
}
