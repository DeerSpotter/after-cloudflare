export const PROVIDERS = [
    {
        name: "cdn-a",
        baseUrl: "https://cdn-a.example.com",
        priority: 1,
        enabled: true,
        costWeight: 1.0,
        regionBias: {
            us: 0,
            europe: 10,
            "asia-pacific": 15,
            global: 5
        }
    },
    {
        name: "cdn-b",
        baseUrl: "https://cdn-b.example.com",
        priority: 2,
        enabled: true,
        costWeight: 0.8,
        regionBias: {
            us: 5,
            europe: 0,
            "asia-pacific": 10,
            global: 5
        }
    },
    {
        name: "cdn-c",
        baseUrl: "https://cdn-c.example.com",
        priority: 3,
        enabled: true,
        costWeight: 0.6,
        regionBias: {
            us: 10,
            europe: 10,
            "asia-pacific": 0,
            global: 5
        }
    }
];
