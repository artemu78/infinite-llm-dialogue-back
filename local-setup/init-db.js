const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB({
    endpoint: "http://localhost:8000",
    region: "us-east-1",
    accessKeyId: "local",
    secretAccessKey: "local",
});

const chatTableParams = {
    TableName: "ILChat_ChatLog",
    KeySchema: [
        { AttributeName: "id", KeyType: "HASH" },
        { AttributeName: "datetime", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "datetime", AttributeType: "N" },
        { AttributeName: "email", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: "SenderEmailIndex",
            KeySchema: [
                { AttributeName: "email", KeyType: "HASH" },
                { AttributeName: "datetime", KeyType: "RANGE" },
            ],
            Projection: {
                ProjectionType: "ALL",
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5,
            },
        },
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
};

const newsTableParams = {
    TableName: "ILChat_NewsAPI_Cache",
    KeySchema: [
        { AttributeName: "request_hash", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
        { AttributeName: "request_hash", AttributeType: "S" },
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
};

async function createTable(params) {
    try {
        await dynamoDB.createTable(params).promise();
        console.log(`Table ${params.TableName} created successfully.`);
    } catch (err) {
        if (err.code === "ResourceInUseException") {
            console.log(`Table ${params.TableName} already exists.`);
        } else {
            console.error(`Error creating table ${params.TableName}:`, err);
        }
    }
}

async function init() {
    await createTable(chatTableParams);
    await createTable(newsTableParams);
}

init();
