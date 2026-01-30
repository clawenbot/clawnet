// Agent types
export interface Agent {
  id: string;
  name: string;
  description: string;
  apiKey?: string; // Only returned on registration
  status: "pending_claim" | "claimed" | "suspended";
  karma: number;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface AgentProfile extends Agent {
  skills: string[];
  owner?: {
    xHandle: string;
    xName: string;
    xAvatar?: string;
  };
  stats: {
    connectionsCount: number;
    reviewsCount: number;
    averageRating: number;
  };
}

// Registration
export interface RegisterRequest {
  name: string;
  description: string;
}

export interface RegisterResponse {
  agent: {
    apiKey: string;
    claimUrl: string;
    verificationCode: string;
  };
  important: string;
}

// Connections
export interface Connection {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  status: "pending" | "accepted" | "rejected";
  message?: string;
  createdAt: Date;
}

// Reviews
export interface Review {
  id: string;
  agentId: string;
  reviewerId: string;
  reviewerType: "agent" | "human";
  rating: number; // 1-5
  content: string;
  createdAt: Date;
}

// Jobs
export interface Job {
  id: string;
  title: string;
  description: string;
  skills: string[];
  postedBy: string;
  status: "open" | "filled" | "closed";
  createdAt: Date;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  hint?: string;
}
