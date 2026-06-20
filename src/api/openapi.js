// OpenAPI 3.0.3 spec for the wapi REST API. Served as JSON at /openapi.json
// and rendered as a self-contained dark/green explorer at /docs (no CDN).
// The spec mirrors the route handlers; all descriptions are in English.
export const openapiSpec = {
  "openapi": "3.0.3",
  "info": {
    "title": "wapi — WhatsApp REST API",
    "version": "0.1.0",
    "description": "Self-hosted WhatsApp REST API built on a from-scratch native implementation of the WhatsApp multi-device protocol (Noise + Signal + binary codec). No browser, no third-party protocol library. Unofficial; using it violates WhatsApp’s Terms of Service — use test numbers only.",
    "license": {
      "name": "MIT"
    }
  },
  "servers": [
    {
      "url": "http://127.0.0.1:4000",
      "description": "Local server"
    }
  ],
  "tags": [
    {
      "name": "General",
      "description": "Service-level endpoints."
    },
    {
      "name": "Sessions",
      "description": "Create, inspect, link (QR / pairing code) and delete sessions."
    },
    {
      "name": "Messaging",
      "description": "Send and read messages, reactions, polls, edits, receipts."
    },
    {
      "name": "Media & Rich Messages",
      "description": "Media upload/download and interactive messages (buttons, lists, native flow, pin/keep)."
    },
    {
      "name": "Chats",
      "description": "Chat-level actions (archive, pin, mute, read) and presence."
    },
    {
      "name": "Groups",
      "description": "Group metadata, admin, invites, ephemeral, join requests."
    },
    {
      "name": "Communities",
      "description": "Create and manage communities and their subgroups."
    },
    {
      "name": "Profile",
      "description": "Profile, contacts, privacy, blocklist and status/stories."
    },
    {
      "name": "Newsletters",
      "description": "Newsletters / channels."
    },
    {
      "name": "Calls",
      "description": "Detect and reject incoming calls."
    }
  ],
  "components": {
    "securitySchemes": {
      "ApiKey": {
        "type": "apiKey",
        "in": "header",
        "name": "x-api-key",
        "description": "Required only when WAPI_KEY is set on the server."
      }
    },
    "parameters": {
      "SessionId": {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "Session identifier.",
        "schema": {
          "type": "string",
          "example": "me"
        }
      }
    },
    "schemas": {
      "SessionInfo": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "example": "me"
          },
          "status": {
            "type": "string",
            "description": "idle | qr | pairing_code | connected | closed | logged_out",
            "example": "connected"
          },
          "hasQr": {
            "type": "boolean",
            "example": false
          },
          "me": {
            "type": "object",
            "nullable": true,
            "properties": {
              "id": {
                "type": "string",
                "example": "34600123456:12@s.whatsapp.net"
              },
              "name": {
                "type": "string",
                "example": "Jaime"
              }
            }
          },
          "calls": {
            "type": "integer",
            "example": 0
          },
          "messages": {
            "type": "integer",
            "example": 3
          },
          "chats": {
            "type": "integer",
            "example": 12
          },
          "lastError": {
            "type": "string",
            "nullable": true,
            "example": null
          },
          "closeReason": {
            "type": "string",
            "nullable": true,
            "example": null
          }
        }
      },
      "NotFound": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string",
            "example": "no_existe"
          }
        }
      }
    }
  },
  "security": [
    {
      "ApiKey": []
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": [
          "General"
        ],
        "summary": "Health check",
        "description": "Liveness probe for the wapi server. Requires no authentication and no session; returns the service name and version.",
        "security": [],
        "responses": {
          "200": {
            "description": "Server is up.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "name": {
                      "type": "string",
                      "example": "wapi"
                    },
                    "version": {
                      "type": "string",
                      "example": "0.1.0"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "name": "wapi",
                  "version": "0.1.0"
                }
              }
            }
          }
        }
      }
    },
    "/sessions": {
      "post": {
        "tags": [
          "Sessions"
        ],
        "summary": "Create or start a session",
        "description": "Creates a new WhatsApp session with the given id (or reuses an existing one) and starts its connection. If the session is idle or closed it is (re)started in the background; a QR code or pairing code can then be retrieved to link a device.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "id"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "description": "Unique session identifier (account name).",
                    "example": "mi-cuenta"
                  }
                }
              },
              "example": {
                "id": "mi-cuenta"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Session created/started.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "example": "mi-cuenta"
                    },
                    "status": {
                      "type": "string",
                      "description": "Current session status (idle, qr, pairing_code, connected, closed, logged_out).",
                      "example": "idle"
                    }
                  }
                },
                "example": {
                  "id": "mi-cuenta",
                  "status": "idle"
                }
              }
            }
          },
          "400": {
            "description": "Missing id field.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "falta_id"
                    },
                    "message": {
                      "type": "string",
                      "example": "Envía { \"id\": \"<nombre>\" }"
                    }
                  }
                },
                "example": {
                  "error": "falta_id",
                  "message": "Envía { \"id\": \"<nombre>\" }"
                }
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "Sessions"
        ],
        "summary": "List sessions",
        "description": "Returns all known sessions with their current status snapshot.",
        "responses": {
          "200": {
            "description": "Array of session status objects.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "sessions": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/SessionInfo"
                      }
                    }
                  }
                },
                "example": {
                  "sessions": [
                    {
                      "id": "mi-cuenta",
                      "status": "connected",
                      "hasQr": false,
                      "me": {
                        "id": "34600123456:12@s.whatsapp.net",
                        "name": "Jaime"
                      },
                      "calls": 0,
                      "messages": 3,
                      "chats": 12,
                      "lastError": null,
                      "closeReason": null
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}": {
      "get": {
        "tags": [
          "Sessions"
        ],
        "summary": "Get session status",
        "description": "Returns the current status object for a single session, including the linked account, message/chat counts and the last error/close reason for diagnostics.",
        "parameters": [
          {
            "$ref": "#/components/parameters/SessionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Session status object.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SessionInfo"
                },
                "example": {
                  "id": "mi-cuenta",
                  "status": "connected",
                  "hasQr": false,
                  "me": {
                    "id": "34600123456:12@s.whatsapp.net",
                    "name": "Jaime"
                  },
                  "calls": 0,
                  "messages": 3,
                  "chats": 12,
                  "lastError": null,
                  "closeReason": null
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFound"
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "Sessions"
        ],
        "summary": "Delete a session",
        "description": "Disconnects the session and permanently deletes its stored credentials from disk.",
        "parameters": [
          {
            "$ref": "#/components/parameters/SessionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Session deleted.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "example": "mi-cuenta"
                    },
                    "deleted": {
                      "type": "boolean",
                      "example": true
                    }
                  }
                },
                "example": {
                  "id": "mi-cuenta",
                  "deleted": true
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFound"
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/qr": {
      "get": {
        "tags": [
          "Sessions"
        ],
        "summary": "Get pending QR (text)",
        "description": "Returns the raw QR string to encode and scan in WhatsApp (Linked devices). The QR rotates roughly every 20 seconds while the session is in the login phase.",
        "parameters": [
          {
            "$ref": "#/components/parameters/SessionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Pending QR available.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "qr": {
                      "type": "string",
                      "description": "Raw QR payload to render as a QR code.",
                      "example": "2@abcd1234...,kqV3...,Hf9...,="
                    },
                    "status": {
                      "type": "string",
                      "example": "qr"
                    }
                  }
                },
                "example": {
                  "qr": "2@abcd1234...,kqV3...,Hf9...,=",
                  "status": "qr"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFound"
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "No QR pending (e.g. already connected or not in login phase).",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "connected"
                    },
                    "message": {
                      "type": "string",
                      "example": "No hay QR pendiente"
                    }
                  }
                },
                "example": {
                  "status": "connected",
                  "message": "No hay QR pendiente"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/qr.png": {
      "get": {
        "tags": [
          "Sessions"
        ],
        "summary": "Get pending QR (PNG image)",
        "description": "Returns the pending QR rendered as a scannable PNG image. The response carries a Refresh header (15s) so opening it in a browser auto-reloads the current QR as it rotates.",
        "parameters": [
          {
            "$ref": "#/components/parameters/SessionId"
          }
        ],
        "responses": {
          "200": {
            "description": "QR PNG image.",
            "content": {
              "image/png": {
                "schema": {
                  "type": "string",
                  "format": "binary"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFound"
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "No QR pending.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "connected"
                    },
                    "message": {
                      "type": "string",
                      "example": "No hay QR pendiente"
                    }
                  }
                },
                "example": {
                  "status": "connected",
                  "message": "No hay QR pendiente"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/pairing-code": {
      "post": {
        "tags": [
          "Sessions"
        ],
        "summary": "Request a pairing code",
        "description": "Requests an 8-character pairing code as an alternative to scanning a QR. Enter the returned code in WhatsApp under Linked devices > Link with phone number. The session must be connected to the server and not yet paired.",
        "parameters": [
          {
            "$ref": "#/components/parameters/SessionId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "phone"
                ],
                "properties": {
                  "phone": {
                    "type": "string",
                    "description": "Phone number in international format, digits only (non-digit characters are stripped).",
                    "example": "34600123456"
                  }
                }
              },
              "example": {
                "phone": "34600123456"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Pairing code generated.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "string",
                      "description": "8-character pairing code to type on the phone.",
                      "example": "ABCD1234"
                    },
                    "status": {
                      "type": "string",
                      "example": "pairing_code"
                    }
                  }
                },
                "example": {
                  "code": "ABCD1234",
                  "status": "pairing_code"
                }
              }
            }
          },
          "400": {
            "description": "Missing phone field.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "falta_phone"
                    }
                  }
                },
                "example": {
                  "error": "falta_phone"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFound"
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Pairing failed (e.g. session already paired or not connected).",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "fallo"
                    },
                    "message": {
                      "type": "string",
                      "example": "la sesión ya está emparejada"
                    }
                  }
                },
                "example": {
                  "error": "fallo",
                  "message": "la sesión ya está emparejada"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/logout": {
      "post": {
        "tags": [
          "Sessions"
        ],
        "summary": "Log out a session",
        "description": "Closes the WhatsApp connection without deleting the stored credentials, and disables automatic reconnection. The session can be started again later with the same credentials.",
        "parameters": [
          {
            "$ref": "#/components/parameters/SessionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Session closed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "example": "mi-cuenta"
                    },
                    "status": {
                      "type": "string",
                      "example": "closed"
                    }
                  }
                },
                "example": {
                  "id": "mi-cuenta",
                  "status": "closed"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFound"
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages": {
      "get": {
        "tags": [
          "Messaging"
        ],
        "summary": "List inbound messages",
        "description": "Returns the buffer of decrypted inbound messages received by this session (most recent first, capped at the last 200). Includes text, reactions, polls, locations, contacts, and media metadata.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Decrypted inbound messages.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "messages": {
                      "type": "array",
                      "items": {
                        "type": "object"
                      }
                    }
                  }
                },
                "example": {
                  "messages": [
                    {
                      "id": "3EB0A1B2C3D4E5F6",
                      "chat": "34600123456@s.whatsapp.net",
                      "from": "34600123456@s.whatsapp.net",
                      "at": "2026-06-20T10:00:00.000Z",
                      "text": "Hello"
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/reactions": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "React to a message",
        "description": "Sends an emoji reaction to a target message. Pass an empty emoji string to remove a previously sent reaction.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "key",
                  "emoji"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "key": {
                    "type": "object",
                    "description": "Key of the target message being reacted to.",
                    "required": [
                      "remoteJid",
                      "fromMe",
                      "id"
                    ],
                    "properties": {
                      "remoteJid": {
                        "type": "string",
                        "example": "34600123456@s.whatsapp.net"
                      },
                      "fromMe": {
                        "type": "boolean",
                        "example": false
                      },
                      "id": {
                        "type": "string",
                        "example": "3EB0A1B2C3D4E5F6"
                      },
                      "participant": {
                        "type": "string",
                        "description": "Sender JID inside a group (group reactions only).",
                        "example": "34600123456@s.whatsapp.net"
                      }
                    }
                  },
                  "emoji": {
                    "type": "string",
                    "description": "Emoji to apply, or empty string to remove the reaction.",
                    "example": "👍"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Reaction sent.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/location": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Send a location message",
        "description": "Sends a geographic location with latitude/longitude and an optional name and address.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "latitude",
                  "longitude"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "latitude": {
                    "type": "number",
                    "description": "Latitude in decimal degrees.",
                    "example": 40.4168
                  },
                  "longitude": {
                    "type": "number",
                    "description": "Longitude in decimal degrees.",
                    "example": -3.7038
                  },
                  "name": {
                    "type": "string",
                    "description": "Optional place name.",
                    "example": "Puerta del Sol"
                  },
                  "address": {
                    "type": "string",
                    "description": "Optional street address.",
                    "example": "Plaza de la Puerta del Sol, Madrid"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Location sent.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/contacts": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Send contact card(s)",
        "description": "Sends one or several contact cards (vCards). Provide a single object for one contact or an array for multiple contacts.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "contacts"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "contacts": {
                    "description": "A single contact object or an array of contact objects.",
                    "oneOf": [
                      {
                        "type": "object",
                        "properties": {
                          "displayName": {
                            "type": "string"
                          },
                          "vcard": {
                            "type": "string"
                          }
                        }
                      },
                      {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "displayName": {
                              "type": "string"
                            },
                            "vcard": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    ],
                    "example": {
                      "displayName": "Alice",
                      "vcard": "BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nTEL;type=CELL;waid=34600123456:+34 600 123 456\nEND:VCARD"
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Contact(s) sent.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/polls": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Send a poll",
        "description": "Creates and sends a poll with a question and a list of options. selectableCount controls how many options voters may select (defaults to 1, i.e. a single-choice poll).",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "name",
                  "options"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "name": {
                    "type": "string",
                    "description": "Poll question.",
                    "example": "Lunch today?"
                  },
                  "options": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "List of answer options.",
                    "example": [
                      "Pizza",
                      "Sushi",
                      "Salad"
                    ]
                  },
                  "selectableCount": {
                    "type": "integer",
                    "description": "Maximum number of options a voter can select. Defaults to 1.",
                    "example": 1
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Poll sent.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/edit": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Edit a sent message",
        "description": "Edits the text of a message previously sent by this session. targetId is the message id returned when the original message was sent.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "targetId",
                  "text"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID of the chat containing the message.",
                    "example": "34600123456"
                  },
                  "targetId": {
                    "type": "string",
                    "description": "Id of the original message to edit.",
                    "example": "3EB0A1B2C3D4E5F6"
                  },
                  "text": {
                    "type": "string",
                    "description": "New message text.",
                    "example": "Edited message text"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Edit sent.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0NEWEDITID",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/revoke": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Revoke (delete for everyone) a message",
        "description": "Revokes a message so it is removed for all participants. The key identifies the target message; fromMe defaults to true when omitted.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "key"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID of the chat.",
                    "example": "34600123456"
                  },
                  "key": {
                    "type": "object",
                    "required": [
                      "id"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "example": "3EB0A1B2C3D4E5F6"
                      },
                      "fromMe": {
                        "type": "boolean",
                        "description": "Whether the message was sent by this account. Defaults to true.",
                        "example": true
                      },
                      "participant": {
                        "type": "string",
                        "description": "Sender JID inside a group (group revoke of others' messages).",
                        "example": "34600123456@s.whatsapp.net"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Revoke sent.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0REVOKEID",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/forward": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Forward a message",
        "description": "Forwards a message object (the raw WhatsApp Message content, e.g. {conversation} or {imageMessage}) to another chat. The forwarding score and forwarded flag are set automatically.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "message"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "message": {
                    "type": "object",
                    "description": "Raw Message content object to forward.",
                    "example": {
                      "conversation": "Take a look at this"
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message forwarded.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0FWDID",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/star": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Star or unstar a message",
        "description": "Stars or unstars a message in a chat via an app-state mutation that syncs across the account's devices. starred defaults to true when omitted.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "jid",
                  "key"
                ],
                "properties": {
                  "jid": {
                    "type": "string",
                    "description": "JID of the chat containing the message.",
                    "example": "34600123456@s.whatsapp.net"
                  },
                  "key": {
                    "type": "object",
                    "required": [
                      "id",
                      "fromMe"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "example": "3EB0A1B2C3D4E5F6"
                      },
                      "fromMe": {
                        "type": "boolean",
                        "example": true
                      }
                    }
                  },
                  "starred": {
                    "type": "boolean",
                    "description": "Whether to star (true) or unstar (false). Defaults to true.",
                    "example": true
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "App-state mutation applied.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "version": 42
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/deleteforme": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Delete a message for me",
        "description": "Deletes a message only on this account (delete-for-me) via an app-state mutation. An optional timestamp may be supplied; it defaults to the current time.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "jid",
                  "key"
                ],
                "properties": {
                  "jid": {
                    "type": "string",
                    "description": "JID of the chat containing the message.",
                    "example": "34600123456@s.whatsapp.net"
                  },
                  "key": {
                    "type": "object",
                    "required": [
                      "id",
                      "fromMe"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "example": "3EB0A1B2C3D4E5F6"
                      },
                      "fromMe": {
                        "type": "boolean",
                        "example": false
                      }
                    }
                  },
                  "timestamp": {
                    "type": "integer",
                    "description": "Message timestamp in milliseconds. Defaults to now.",
                    "example": 1718900000000
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "App-state mutation applied.",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "version": 43
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/read": {
      "post": {
        "tags": [
          "Messaging"
        ],
        "summary": "Mark messages as read",
        "description": "Sends a read receipt for one or more messages in a chat. Use type 'read' for blue ticks or 'read-self' to mark read only on your own devices.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "from",
                  "ids"
                ],
                "properties": {
                  "from": {
                    "type": "string",
                    "description": "JID of the chat the messages belong to.",
                    "example": "34600123456@s.whatsapp.net"
                  },
                  "ids": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Message ids to mark as read.",
                    "example": [
                      "3EB0A1B2C3D4E5F6"
                    ]
                  },
                  "type": {
                    "type": "string",
                    "enum": [
                      "read",
                      "read-self"
                    ],
                    "description": "Receipt type. Any value other than 'read-self' is treated as 'read'.",
                    "example": "read"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Receipt sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean"
                    },
                    "marked": {
                      "type": "integer"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "marked": 1
                }
              }
            }
          },
          "400": {
            "description": "Missing 'from' or 'ids'.",
            "content": {
              "application/json": {
                "example": {
                  "error": "faltan_from_o_ids"
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/chats": {
      "get": {
        "tags": [
          "Messaging"
        ],
        "summary": "List chats",
        "description": "Returns the chats gathered from the history sync performed when the session was linked, ordered by most recent activity.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Chats from history sync.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "count": {
                      "type": "integer"
                    },
                    "chats": {
                      "type": "array",
                      "items": {
                        "type": "object"
                      }
                    }
                  }
                },
                "example": {
                  "count": 1,
                  "chats": [
                    {
                      "id": "34600123456@s.whatsapp.net",
                      "name": "Alice",
                      "timestamp": 1718900000
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/media": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Send a media message",
        "description": "Sends an image, audio, video, document or sticker to a contact. The file is provided inline as base64 (an optional `data:<mime>;base64,` prefix is stripped); the server encrypts it, uploads it once, and then relays the encrypted message to every device of the recipient.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "type",
                  "base64"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "type": {
                    "type": "string",
                    "enum": [
                      "image",
                      "audio",
                      "video",
                      "document",
                      "sticker"
                    ],
                    "description": "Media type.",
                    "example": "image"
                  },
                  "base64": {
                    "type": "string",
                    "description": "File contents, base64-encoded. A leading data URI prefix is accepted and stripped.",
                    "example": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
                  },
                  "caption": {
                    "type": "string",
                    "description": "Caption text. Only applied for image, video and document.",
                    "example": "Here is the photo"
                  },
                  "mimetype": {
                    "type": "string",
                    "description": "Override MIME type. Defaults per type (e.g. image/jpeg, audio/ogg; codecs=opus, application/pdf, video/mp4, image/webp).",
                    "example": "image/jpeg"
                  },
                  "fileName": {
                    "type": "string",
                    "description": "File name, used for document type (defaults to \"file\").",
                    "example": "invoice.pdf"
                  },
                  "ptt": {
                    "type": "boolean",
                    "description": "For audio only: send as a push-to-talk voice note.",
                    "example": true
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "type": "image",
                "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
                "caption": "Here is the photo"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Media sent. Returns the relay result.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "description": "Generated message id.",
                      "example": "3EB0A1B2C3D4E5F6"
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "devices": {
                      "type": "integer",
                      "description": "Number of recipient devices the message was encrypted for.",
                      "example": 2
                    },
                    "type": {
                      "type": "string",
                      "example": "image"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2,
                  "type": "image"
                }
              }
            }
          },
          "400": {
            "description": "Missing required fields (`faltan_to_type_base64`) or invalid type (`tipo_invalido`).",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "faltan_to_type_base64"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "sesión no emparejada"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/{msgId}/media": {
      "get": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Download media of a received message",
        "description": "Downloads and decrypts the media attached to a previously received message and returns it base64-encoded together with its MIME type and (if any) file name.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          },
          {
            "name": "msgId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Id of the received message that carries the media.",
            "example": "3EB0A1B2C3D4E5F6"
          }
        ],
        "responses": {
          "200": {
            "description": "Decrypted media.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "mimetype": {
                      "type": "string",
                      "example": "image/jpeg"
                    },
                    "fileName": {
                      "type": "string",
                      "nullable": true,
                      "example": null
                    },
                    "base64": {
                      "type": "string",
                      "description": "Decrypted file contents, base64-encoded.",
                      "example": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
                    }
                  }
                },
                "example": {
                  "mimetype": "image/jpeg",
                  "fileName": null,
                  "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id (`no_existe`) or media not available / message not found (`media_no_disponible`).",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "media_no_disponible",
                  "message": "mensaje con media no encontrado"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/buttons": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Send a quick-reply buttons message (legacy)",
        "description": "Sends a legacy buttons message with up to a handful of quick-reply buttons, an optional footer, and body text.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "text",
                  "buttons"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "text": {
                    "type": "string",
                    "description": "Body / content text shown above the buttons.",
                    "example": "Do you confirm your order?"
                  },
                  "footer": {
                    "type": "string",
                    "description": "Optional footer text.",
                    "example": "Reply within 24h"
                  },
                  "buttons": {
                    "type": "array",
                    "description": "Quick-reply buttons.",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "text"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "description": "Button id returned when the user taps it.",
                          "example": "confirm"
                        },
                        "text": {
                          "type": "string",
                          "description": "Button label.",
                          "example": "Confirm"
                        }
                      }
                    },
                    "example": [
                      {
                        "id": "confirm",
                        "text": "Confirm"
                      },
                      {
                        "id": "cancel",
                        "text": "Cancel"
                      }
                    ]
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "text": "Do you confirm your order?",
                "footer": "Reply within 24h",
                "buttons": [
                  {
                    "id": "confirm",
                    "text": "Confirm"
                  },
                  {
                    "id": "cancel",
                    "text": "Cancel"
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "example": "3EB0A1B2C3D4E5F6"
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "devices": {
                      "type": "integer",
                      "example": 2
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "sin dispositivos destino"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/list": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Send a list message (legacy)",
        "description": "Sends a legacy list message: a button that opens a menu of sections, each with selectable rows.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "title",
                  "description",
                  "buttonText",
                  "sections"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "title": {
                    "type": "string",
                    "description": "List title.",
                    "example": "Our menu"
                  },
                  "description": {
                    "type": "string",
                    "description": "Body text shown above the list button.",
                    "example": "Pick a dish to order"
                  },
                  "buttonText": {
                    "type": "string",
                    "description": "Label of the button that opens the list.",
                    "example": "View menu"
                  },
                  "footer": {
                    "type": "string",
                    "description": "Optional footer text.",
                    "example": "Prices include VAT"
                  },
                  "sections": {
                    "type": "array",
                    "description": "List sections.",
                    "items": {
                      "type": "object",
                      "properties": {
                        "title": {
                          "type": "string",
                          "description": "Section title.",
                          "example": "Starters"
                        },
                        "rows": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "description": "Row id returned when selected.",
                                "example": "row_salad"
                              },
                              "title": {
                                "type": "string",
                                "example": "Salad"
                              },
                              "description": {
                                "type": "string",
                                "example": "Fresh garden salad"
                              }
                            }
                          }
                        }
                      }
                    },
                    "example": [
                      {
                        "title": "Starters",
                        "rows": [
                          {
                            "id": "row_salad",
                            "title": "Salad",
                            "description": "Fresh garden salad"
                          }
                        ]
                      }
                    ]
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "title": "Our menu",
                "description": "Pick a dish to order",
                "buttonText": "View menu",
                "footer": "Prices include VAT",
                "sections": [
                  {
                    "title": "Starters",
                    "rows": [
                      {
                        "id": "row_salad",
                        "title": "Salad",
                        "description": "Fresh garden salad"
                      }
                    ]
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "example": "3EB0A1B2C3D4E5F6"
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "devices": {
                      "type": "integer",
                      "example": 2
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "sin dispositivos destino"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/interactive": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Send a modern interactive (native flow) message",
        "description": "Sends a modern interactive message built on the native-flow format. Each button has a `name` (e.g. quick_reply, cta_url, cta_call, single_select) and a `params` object that is JSON-encoded into the button payload.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "buttons"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient phone number or JID.",
                    "example": "34600123456"
                  },
                  "title": {
                    "type": "string",
                    "description": "Optional header title.",
                    "example": "Special offer"
                  },
                  "subtitle": {
                    "type": "string",
                    "description": "Optional header subtitle.",
                    "example": "Limited time"
                  },
                  "body": {
                    "type": "string",
                    "description": "Optional body text.",
                    "example": "Tap below to learn more"
                  },
                  "footer": {
                    "type": "string",
                    "description": "Optional footer text.",
                    "example": "Powered by wapi"
                  },
                  "buttons": {
                    "type": "array",
                    "description": "Native-flow buttons.",
                    "items": {
                      "type": "object",
                      "required": [
                        "name",
                        "params"
                      ],
                      "properties": {
                        "name": {
                          "type": "string",
                          "description": "Button type: quick_reply, cta_url, cta_call or single_select.",
                          "example": "cta_url"
                        },
                        "params": {
                          "type": "object",
                          "description": "Button parameters; serialized to JSON. May also be passed as a pre-serialized JSON string.",
                          "example": {
                            "display_text": "Visit site",
                            "url": "https://example.com"
                          }
                        }
                      }
                    },
                    "example": [
                      {
                        "name": "cta_url",
                        "params": {
                          "display_text": "Visit site",
                          "url": "https://example.com"
                        }
                      }
                    ]
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "title": "Special offer",
                "body": "Tap below to learn more",
                "footer": "Powered by wapi",
                "buttons": [
                  {
                    "name": "cta_url",
                    "params": {
                      "display_text": "Visit site",
                      "url": "https://example.com"
                    }
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "example": "3EB0A1B2C3D4E5F6"
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "devices": {
                      "type": "integer",
                      "example": 2
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F6",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "sin dispositivos destino"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/pin": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Pin or unpin a message in a chat",
        "description": "Pins or unpins a message in the chat with the given recipient. When pinning, an optional duration in seconds controls how long the pin lasts (defaults to 86400 = 24h).",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "key"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Chat phone number or JID.",
                    "example": "34600123456"
                  },
                  "key": {
                    "type": "object",
                    "description": "Key of the message to pin.",
                    "required": [
                      "id"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "description": "Target message id.",
                        "example": "3EB0A1B2C3D4E5F6"
                      },
                      "fromMe": {
                        "type": "boolean",
                        "description": "Whether the target message was sent by you. Defaults to true.",
                        "example": false
                      },
                      "participant": {
                        "type": "string",
                        "description": "In group chats, the JID of the message author.",
                        "example": "34600123456@s.whatsapp.net"
                      }
                    }
                  },
                  "pin": {
                    "type": "boolean",
                    "description": "true to pin (default), false to unpin.",
                    "example": true
                  },
                  "seconds": {
                    "type": "integer",
                    "description": "Pin duration in seconds when pinning. Defaults to 86400.",
                    "example": 604800
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "key": {
                  "id": "3EB0A1B2C3D4E5F6",
                  "fromMe": false
                },
                "pin": true,
                "seconds": 604800
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Pin state updated.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "example": "3EB0A1B2C3D4E5F7"
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "devices": {
                      "type": "integer",
                      "example": 2
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F7",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "sin dispositivos destino"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/messages/keep": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Keep or un-keep an ephemeral message",
        "description": "Marks an ephemeral (disappearing) message to be kept in the chat, or removes that mark, so it is preserved past its expiration.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "key"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Chat phone number or JID.",
                    "example": "34600123456"
                  },
                  "key": {
                    "type": "object",
                    "description": "Key of the ephemeral message.",
                    "required": [
                      "id"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "description": "Target message id.",
                        "example": "3EB0A1B2C3D4E5F6"
                      },
                      "fromMe": {
                        "type": "boolean",
                        "description": "Whether the target message was sent by you. Defaults to true.",
                        "example": false
                      },
                      "participant": {
                        "type": "string",
                        "description": "In group chats, the JID of the message author.",
                        "example": "34600123456@s.whatsapp.net"
                      }
                    }
                  },
                  "keep": {
                    "type": "boolean",
                    "description": "true to keep (default), false to un-keep.",
                    "example": true
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "key": {
                  "id": "3EB0A1B2C3D4E5F6",
                  "fromMe": false
                },
                "keep": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Keep state updated.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "example": "3EB0A1B2C3D4E5F8"
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "devices": {
                      "type": "integer",
                      "example": 2
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0A1B2C3D4E5F8",
                  "to": "34600123456@s.whatsapp.net",
                  "devices": 2
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "sin dispositivos destino"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/receipts/played": {
      "post": {
        "tags": [
          "Media & Rich Messages"
        ],
        "summary": "Send a 'played' receipt",
        "description": "Sends a 'played' receipt for one or more audio / voice-note (ptt) messages, signalling to the sender that they were listened to.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id.",
            "example": "main"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "ids"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Sender / chat phone number or JID.",
                    "example": "34600123456"
                  },
                  "ids": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Ids of the played messages.",
                    "example": [
                      "3EB0A1B2C3D4E5F6",
                      "3EB0A1B2C3D4E5F7"
                    ]
                  },
                  "participant": {
                    "type": "string",
                    "description": "In group chats, the JID of the message author.",
                    "example": "34600123456@s.whatsapp.net"
                  }
                }
              },
              "example": {
                "to": "34600123456",
                "ids": [
                  "3EB0A1B2C3D4E5F6",
                  "3EB0A1B2C3D4E5F7"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Receipt sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "type": {
                      "type": "string",
                      "example": "played"
                    },
                    "ids": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      },
                      "example": [
                        "3EB0A1B2C3D4E5F6",
                        "3EB0A1B2C3D4E5F7"
                      ]
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "type": "played",
                  "ids": [
                    "3EB0A1B2C3D4E5F6",
                    "3EB0A1B2C3D4E5F7"
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "error"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/chats/{jid}/archive": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Archive or unarchive a chat",
        "description": "Archives or unarchives the given chat by issuing an app-state patch synced to the WhatsApp account across all linked devices.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          },
          {
            "name": "jid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Chat JID (user or group), e.g. 34600123456@s.whatsapp.net.",
            "example": "34600123456@s.whatsapp.net"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "archived": {
                    "type": "boolean",
                    "description": "true to archive (default), false to unarchive. Omitting the field archives.",
                    "example": true
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Patch applied.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "version": {
                      "type": "integer",
                      "example": 4
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "version": 4
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Patch failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "app state error"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/chats/{jid}/pin": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Pin or unpin a chat",
        "description": "Pins or unpins the given chat in the chat list via an app-state patch synced across linked devices.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          },
          {
            "name": "jid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Chat JID (user or group).",
            "example": "34600123456@s.whatsapp.net"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "pinned": {
                    "type": "boolean",
                    "description": "true to pin (default), false to unpin. Omitting the field pins.",
                    "example": true
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Patch applied.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "version": {
                      "type": "integer",
                      "example": 7
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "version": 7
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Patch failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "app state error"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/chats/{jid}/mute": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Mute or unmute a chat",
        "description": "Mutes or unmutes the given chat. Provide a Unix timestamp (milliseconds) in 'until' to mute until that moment; omit or send null to mute with no end time.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          },
          {
            "name": "jid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Chat JID (user or group).",
            "example": "34600123456@s.whatsapp.net"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "until": {
                    "type": "integer",
                    "nullable": true,
                    "description": "Unix timestamp in milliseconds marking when the mute ends. Omit or null to mute indefinitely. Send false to unmute.",
                    "example": 1782000000000
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Patch applied.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "version": {
                      "type": "integer",
                      "example": 2
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "version": 2
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Patch failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "app state error"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/chats/{jid}/read": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Mark a chat as read or unread",
        "description": "Marks the whole chat as read or unread via an app-state patch synced across linked devices.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          },
          {
            "name": "jid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Chat JID (user or group).",
            "example": "34600123456@s.whatsapp.net"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "read": {
                    "type": "boolean",
                    "description": "true to mark as read (default), false to mark as unread. Omitting the field marks as read.",
                    "example": true
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Patch applied.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "version": {
                      "type": "integer",
                      "example": 9
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "version": 9
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Patch failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "app state error"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/presence": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Set own presence",
        "description": "Broadcasts the account's own global presence to WhatsApp. Use 'available' to appear online and 'unavailable' to appear offline.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "available",
                      "unavailable"
                    ],
                    "description": "Presence to announce. Defaults to 'available' when omitted.",
                    "example": "available"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Presence sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "type": {
                      "type": "string",
                      "example": "available"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "type": "available"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "socket closed"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/presence/subscribe": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Subscribe to a contact's presence",
        "description": "Subscribes to presence updates for a contact so the session starts receiving their online/last-seen/typing state. Required before GET /presence will report data for that contact.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Contact JID or phone number to subscribe to.",
                    "example": "34600123456@s.whatsapp.net"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Subscription request sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "to": "34600123456@s.whatsapp.net"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "socket closed"
                }
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "Chats"
        ],
        "summary": "Get known presences",
        "description": "Returns the map of presence states the session has received so far, keyed by contact/participant JID. Populated only for contacts you have subscribed to or who have sent chat-state updates.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          }
        ],
        "responses": {
          "200": {
            "description": "Current presence map.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "presences": {
                      "type": "object",
                      "additionalProperties": {
                        "type": "object",
                        "properties": {
                          "lastKnownPresence": {
                            "type": "string",
                            "example": "available"
                          },
                          "lastSeen": {
                            "type": "integer",
                            "nullable": true,
                            "example": 1781990000
                          },
                          "groupOnlineCount": {
                            "type": "integer",
                            "nullable": true,
                            "example": 3
                          },
                          "at": {
                            "type": "string",
                            "format": "date-time",
                            "example": "2026-06-20T10:15:00.000Z"
                          }
                        }
                      }
                    }
                  }
                },
                "example": {
                  "presences": {
                    "34600123456@s.whatsapp.net": {
                      "lastKnownPresence": "available",
                      "lastSeen": 1781990000,
                      "at": "2026-06-20T10:15:00.000Z"
                    },
                    "34600654321@s.whatsapp.net": {
                      "lastKnownPresence": "recording",
                      "at": "2026-06-20T10:16:42.000Z"
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/chatstate": {
      "post": {
        "tags": [
          "Chats"
        ],
        "summary": "Send a chat state (typing indicator)",
        "description": "Sends a chat-state indicator to a contact: 'composing' (typing), 'recording' (recording audio) or 'paused' (cleared). 'recording' is sent as a composing node tagged with audio media.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Session id."
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "to",
                  "state"
                ],
                "properties": {
                  "to": {
                    "type": "string",
                    "description": "Recipient JID or phone number.",
                    "example": "34600123456@s.whatsapp.net"
                  },
                  "state": {
                    "type": "string",
                    "enum": [
                      "composing",
                      "recording",
                      "paused"
                    ],
                    "description": "Chat state to broadcast.",
                    "example": "composing"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Chat state sent.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "to": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "state": {
                      "type": "string",
                      "example": "composing"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "to": "34600123456@s.whatsapp.net",
                  "state": "composing"
                }
              }
            }
          },
          "404": {
            "description": "Unknown session id.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session is not connected.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "example": {
                  "error": "envio_fallido",
                  "message": "socket closed"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}": {
      "get": {
        "tags": [
          "Groups"
        ],
        "summary": "Get group metadata",
        "description": "Fetches metadata for a group: subject, owner, creation time, settings, ephemeral duration and the full participant list. The group jid must be URL-encoded in the path.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded), e.g. 123456-789%40g.us",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "responses": {
          "200": {
            "description": "Group metadata",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "example": "123456-789@g.us"
                    },
                    "subject": {
                      "type": "string",
                      "example": "My Group"
                    },
                    "creation": {
                      "type": "integer",
                      "example": 1718000000
                    },
                    "owner": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "addressingMode": {
                      "type": "string",
                      "example": "pn"
                    },
                    "desc": {
                      "type": "string",
                      "example": "Group description"
                    },
                    "descId": {
                      "type": "string",
                      "example": "3EB0ABCDEF0123456789"
                    },
                    "restrict": {
                      "type": "boolean",
                      "example": false
                    },
                    "announce": {
                      "type": "boolean",
                      "example": false
                    },
                    "ephemeralDuration": {
                      "type": "integer",
                      "example": 0
                    },
                    "memberAddMode": {
                      "type": "boolean",
                      "example": false
                    },
                    "joinApprovalMode": {
                      "type": "boolean",
                      "example": false
                    },
                    "linkedParent": {
                      "type": "string",
                      "example": "123000-111@g.us"
                    },
                    "isCommunity": {
                      "type": "boolean",
                      "example": false
                    },
                    "isCommunityAnnounce": {
                      "type": "boolean",
                      "example": false
                    },
                    "participants": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "string",
                            "example": "34600123456@s.whatsapp.net"
                          },
                          "admin": {
                            "type": "string",
                            "nullable": true,
                            "example": "admin"
                          }
                        }
                      }
                    }
                  }
                },
                "example": {
                  "id": "123456-789@g.us",
                  "subject": "My Group",
                  "creation": 1718000000,
                  "owner": "34600123456@s.whatsapp.net",
                  "addressingMode": "pn",
                  "desc": "Group description",
                  "descId": "3EB0ABCDEF0123456789",
                  "restrict": false,
                  "announce": false,
                  "ephemeralDuration": 0,
                  "memberAddMode": false,
                  "joinApprovalMode": false,
                  "isCommunity": false,
                  "isCommunityAnnounce": false,
                  "participants": [
                    {
                      "id": "34600123456@s.whatsapp.net",
                      "admin": "superadmin"
                    },
                    {
                      "id": "34600654321@s.whatsapp.net",
                      "admin": null
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Query failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "grupo: 404 not-found"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/messages": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Send a text message to a group",
        "description": "Sends a plain text message to a group using sender keys. Returns the generated message id and the number of recipient devices it was encrypted for.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "text"
                ],
                "properties": {
                  "text": {
                    "type": "string",
                    "example": "Hello group!"
                  }
                }
              },
              "example": {
                "text": "Hello group!"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message sent",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "3EB0ABCDEF0123456789",
                  "to": "123456-789@g.us",
                  "devices": 4
                }
              }
            }
          },
          "400": {
            "description": "Missing text field",
            "content": {
              "application/json": {
                "example": {
                  "error": "falta_text"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Send failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "envio_fallido",
                  "message": "timeout"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Create a group",
        "description": "Creates a new group with the given subject and initial participants. Returns the metadata of the newly created group.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "subject"
                ],
                "properties": {
                  "subject": {
                    "type": "string",
                    "example": "My New Group"
                  },
                  "participants": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "example": [
                      "34600123456",
                      "34600654321@s.whatsapp.net"
                    ]
                  }
                }
              },
              "example": {
                "subject": "My New Group",
                "participants": [
                  "34600123456",
                  "34600654321"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Group created (metadata)",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "123456-789@g.us",
                  "subject": "My New Group",
                  "creation": 1718000000,
                  "owner": "34600123456@s.whatsapp.net",
                  "addressingMode": "pn",
                  "restrict": false,
                  "announce": false,
                  "ephemeralDuration": 0,
                  "memberAddMode": false,
                  "joinApprovalMode": false,
                  "isCommunity": false,
                  "isCommunityAnnounce": false,
                  "participants": [
                    {
                      "id": "34600123456@s.whatsapp.net",
                      "admin": "superadmin"
                    },
                    {
                      "id": "34600654321@s.whatsapp.net",
                      "admin": null
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Creation failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "bad-request"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/participants": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Add, remove, promote or demote participants",
        "description": "Updates the participant list of a group. The action determines whether members are added, removed, promoted to admin or demoted. Returns a per-participant result with a status code.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "participants",
                  "action"
                ],
                "properties": {
                  "participants": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "example": [
                      "34600123456",
                      "34600654321"
                    ]
                  },
                  "action": {
                    "type": "string",
                    "enum": [
                      "add",
                      "remove",
                      "promote",
                      "demote"
                    ],
                    "example": "add"
                  }
                }
              },
              "example": {
                "participants": [
                  "34600123456",
                  "34600654321"
                ],
                "action": "add"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Participants updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "result": [
                    {
                      "jid": "34600123456@s.whatsapp.net",
                      "status": "200"
                    },
                    {
                      "jid": "34600654321@s.whatsapp.net",
                      "status": "403"
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/subject": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Change the group subject",
        "description": "Updates the subject (name) of a group. Requires admin privileges in the group.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "subject"
                ],
                "properties": {
                  "subject": {
                    "type": "string",
                    "example": "Renamed Group"
                  }
                }
              },
              "example": {
                "subject": "Renamed Group"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Subject updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/description": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Change or clear the group description",
        "description": "Updates the group description. Omitting the description field or sending an empty string deletes the current description.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "description": {
                    "type": "string",
                    "example": "Welcome to our group!"
                  }
                }
              },
              "example": {
                "description": "Welcome to our group!"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Description updated or cleared",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/setting": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Change group settings (announcement / locked)",
        "description": "Toggles a group-wide setting. Use 'announcement'/'not_announcement' to control whether only admins can send messages, and 'locked'/'unlocked' to control whether only admins can edit group info.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "setting"
                ],
                "properties": {
                  "setting": {
                    "type": "string",
                    "enum": [
                      "announcement",
                      "not_announcement",
                      "locked",
                      "unlocked"
                    ],
                    "example": "announcement"
                  }
                }
              },
              "example": {
                "setting": "announcement"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Setting updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/invite": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Get the group invite code and link",
        "description": "Retrieves the current invite code for the group and the corresponding chat.whatsapp.com invite link.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "responses": {
          "200": {
            "description": "Invite code and link",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "code": "AbCdEfGh123",
                  "link": "https://chat.whatsapp.com/AbCdEfGh123"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Query failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/invite/revoke": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Revoke the group invite code",
        "description": "Revokes the current invite code and generates a new one, invalidating any previously shared invite links. Returns the new code.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "responses": {
          "200": {
            "description": "Invite revoked; new code returned",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "code": "XyZ987newCode"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Revoke failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/accept": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Join a group via invite code",
        "description": "Accepts a group invitation using an invite code (the token from a chat.whatsapp.com link). Returns the jid of the joined group.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code"
                ],
                "properties": {
                  "code": {
                    "type": "string",
                    "example": "AbCdEfGh123"
                  }
                }
              },
              "example": {
                "code": "AbCdEfGh123"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Joined group",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "jid": "123456-789@g.us"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Accept failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "invite-revoked"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/leave": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Leave a group",
        "description": "Removes the current session's account from the group.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "responses": {
          "200": {
            "description": "Left group",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Leave failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "bad-request"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/ephemeral": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Set disappearing-message timer",
        "description": "Enables or disables disappearing messages for the group. Pass the duration in seconds: 0 disables, 86400 = 24h, 604800 = 7 days, 7776000 = 90 days.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "seconds"
                ],
                "properties": {
                  "seconds": {
                    "type": "integer",
                    "enum": [
                      0,
                      86400,
                      604800,
                      7776000
                    ],
                    "example": 604800
                  }
                }
              },
              "example": {
                "seconds": 604800
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Ephemeral timer updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "expiration": 604800
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/requests": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "List pending join requests",
        "description": "Returns the list of pending membership-approval requests for a group that has join approval enabled. Despite returning data, this endpoint uses POST.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "responses": {
          "200": {
            "description": "Pending requests",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "requests": [
                    {
                      "jid": "34600123456@s.whatsapp.net",
                      "request_method": "InviteLink",
                      "request_time": "1718000000"
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Query failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/requests/update": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Approve or reject join requests",
        "description": "Approves or rejects pending membership-approval requests for the given participants. Returns a per-participant status result.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "participants",
                  "action"
                ],
                "properties": {
                  "participants": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "example": [
                      "34600123456"
                    ]
                  },
                  "action": {
                    "type": "string",
                    "enum": [
                      "approve",
                      "reject"
                    ],
                    "example": "approve"
                  }
                }
              },
              "example": {
                "participants": [
                  "34600123456"
                ],
                "action": "approve"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Requests updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "result": [
                    {
                      "jid": "34600123456@s.whatsapp.net",
                      "status": "200"
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/addmode": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Set who can add members",
        "description": "Controls whether any member or only admins can add new members to the group.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "mode"
                ],
                "properties": {
                  "mode": {
                    "type": "string",
                    "enum": [
                      "all_member_add",
                      "admin_add"
                    ],
                    "example": "all_member_add"
                  }
                }
              },
              "example": {
                "mode": "all_member_add"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Add mode updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "mode": "all_member_add"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/groups/{gid}/approvalmode": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Toggle join-approval requirement",
        "description": "Enables ('on') or disables ('off') the requirement that an admin approve new members before they join.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123456-789@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "mode"
                ],
                "properties": {
                  "mode": {
                    "type": "string",
                    "enum": [
                      "on",
                      "off"
                    ],
                    "example": "on"
                  }
                }
              },
              "example": {
                "mode": "on"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Approval mode updated",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "mode": "on"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Update failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/communities": {
      "post": {
        "tags": [
          "Communities"
        ],
        "summary": "Create a community",
        "description": "Creates a new community (a parent group) with the given subject and optional description body. Returns the metadata of the created community.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "subject"
                ],
                "properties": {
                  "subject": {
                    "type": "string",
                    "example": "My Community"
                  },
                  "body": {
                    "type": "string",
                    "example": "A place for all our groups"
                  }
                }
              },
              "example": {
                "subject": "My Community",
                "body": "A place for all our groups"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Community created (metadata)",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "id": "123000-111@g.us",
                  "subject": "My Community",
                  "creation": 1718000000,
                  "owner": "34600123456@s.whatsapp.net",
                  "addressingMode": "pn",
                  "desc": "A place for all our groups",
                  "restrict": false,
                  "announce": false,
                  "ephemeralDuration": 0,
                  "isCommunity": true,
                  "isCommunityAnnounce": false,
                  "participants": [
                    {
                      "id": "34600123456@s.whatsapp.net",
                      "admin": "superadmin"
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Creation failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "bad-request"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/communities/{gid}/link": {
      "post": {
        "tags": [
          "Communities"
        ],
        "summary": "Link a group into a community",
        "description": "Links an existing group as a sub-group of the community identified by the path jid.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The community (parent) jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123000-111@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "groupJid"
                ],
                "properties": {
                  "groupJid": {
                    "type": "string",
                    "example": "123456-789@g.us"
                  }
                }
              },
              "example": {
                "groupJid": "123456-789@g.us"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Group linked",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Link failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/communities/{gid}/unlink": {
      "post": {
        "tags": [
          "Communities"
        ],
        "summary": "Unlink a group from a community",
        "description": "Removes a sub-group from the community identified by the path jid.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The community (parent) jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123000-111@g.us"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "groupJid"
                ],
                "properties": {
                  "groupJid": {
                    "type": "string",
                    "example": "123456-789@g.us"
                  }
                }
              },
              "example": {
                "groupJid": "123456-789@g.us"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Group unlinked",
            "content": {
              "application/json": {
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Unlink failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/communities/{gid}/subgroups": {
      "post": {
        "tags": [
          "Communities"
        ],
        "summary": "List community sub-groups",
        "description": "Returns the list of sub-groups linked to a community. If the path jid is a sub-group, its parent community is resolved automatically. Despite returning data, this endpoint uses POST.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "description": "The community jid, or a sub-group jid (URL-encoded)",
            "schema": {
              "type": "string"
            },
            "example": "123000-111@g.us"
          }
        ],
        "responses": {
          "200": {
            "description": "Sub-groups list",
            "content": {
              "application/json": {
                "example": {
                  "ok": true,
                  "subgroups": [
                    {
                      "id": "123456-789@g.us",
                      "subject": "General",
                      "creation": 1718000000,
                      "owner": "34600123456@s.whatsapp.net",
                      "size": 42
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_existe"
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "example": {
                  "error": "no_conectada",
                  "status": "connecting"
                }
              }
            }
          },
          "500": {
            "description": "Query failed",
            "content": {
              "application/json": {
                "example": {
                  "error": "fallo",
                  "message": "not-authorized"
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/onwhatsapp": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Check if numbers are on WhatsApp",
        "description": "Runs a usync contact query to determine which of the given phone numbers are registered WhatsApp users. Returns the resolved JID and an existence flag for each number.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "numbers"
                ],
                "properties": {
                  "numbers": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Phone numbers in international format (with or without '+'); non-digit characters are stripped.",
                    "example": [
                      "34600123456",
                      "34699888777"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Lookup results",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "results": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "jid": {
                            "type": "string",
                            "example": "34600123456@s.whatsapp.net"
                          },
                          "exists": {
                            "type": "boolean",
                            "example": true
                          }
                        }
                      }
                    }
                  }
                },
                "example": {
                  "results": [
                    {
                      "jid": "34600123456@s.whatsapp.net",
                      "exists": true
                    },
                    {
                      "jid": "34699888777@s.whatsapp.net",
                      "exists": false
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "fallo"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/status/query": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Query the about/status text of contacts",
        "description": "Fetches the 'about' status text for one or more JIDs via a usync query. Returns the status text and, when available, the timestamp it was set at.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "jids"
                ],
                "properties": {
                  "jids": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Contact JIDs to query.",
                    "example": [
                      "34600123456@s.whatsapp.net"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Status results",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "results": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "jid": {
                            "type": "string",
                            "example": "34600123456@s.whatsapp.net"
                          },
                          "status": {
                            "type": "string",
                            "example": "At the beach"
                          },
                          "setAt": {
                            "type": "integer",
                            "example": 1718800000
                          }
                        }
                      }
                    }
                  }
                },
                "example": {
                  "results": [
                    {
                      "jid": "34600123456@s.whatsapp.net",
                      "status": "At the beach",
                      "setAt": 1718800000
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/profile/{jid}/picture": {
      "get": {
        "tags": [
          "Profile"
        ],
        "summary": "Get a profile picture URL",
        "description": "Returns the URL of the profile picture for the given JID. The handler always requests the low-resolution 'preview' picture; the URL is null if no picture is available.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "jid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Target user or group JID.",
            "example": "34600123456@s.whatsapp.net"
          }
        ],
        "responses": {
          "200": {
            "description": "Profile picture URL",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "url": {
                      "type": "string",
                      "nullable": true,
                      "example": "https://pps.whatsapp.net/v/t61.../preview.jpg"
                    }
                  }
                },
                "example": {
                  "url": "https://pps.whatsapp.net/v/t61.../preview.jpg"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/profile/picture": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Set your own profile picture",
        "description": "Uploads and sets the profile picture for the connected account. The image bytes are provided as a base64-encoded JPEG.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "base64"
                ],
                "properties": {
                  "base64": {
                    "type": "string",
                    "description": "Base64-encoded JPEG image bytes.",
                    "example": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Picture updated",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  }
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Operation failed (for example invalid or missing base64)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "fallo"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/profile/picture/remove": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Remove your own profile picture",
        "description": "Removes the profile picture of the connected account. No request body is required.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {}
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Picture removed",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  }
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/profile/status": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Set your own about/status text",
        "description": "Updates the 'about' status text of the connected account.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "text"
                ],
                "properties": {
                  "text": {
                    "type": "string",
                    "description": "The new about/status text. Defaults to an empty string if omitted.",
                    "example": "Working from home"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Status updated",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  }
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/business/{jid}": {
      "get": {
        "tags": [
          "Profile"
        ],
        "summary": "Get a business profile",
        "description": "Fetches the WhatsApp Business profile of the given JID, including address, description, email, websites and category. Returns null if the JID has no business profile.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "jid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Business account JID.",
            "example": "34600123456@s.whatsapp.net"
          }
        ],
        "responses": {
          "200": {
            "description": "Business profile (or null)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "nullable": true,
                  "properties": {
                    "wid": {
                      "type": "string",
                      "example": "34600123456@s.whatsapp.net"
                    },
                    "address": {
                      "type": "string",
                      "example": "Calle Mayor 1, Madrid"
                    },
                    "description": {
                      "type": "string",
                      "example": "Best coffee in town"
                    },
                    "email": {
                      "type": "string",
                      "example": "hello@example.com"
                    },
                    "website": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      },
                      "example": [
                        "https://example.com"
                      ]
                    },
                    "category": {
                      "type": "string",
                      "example": "Food & Beverage"
                    }
                  }
                },
                "example": {
                  "wid": "34600123456@s.whatsapp.net",
                  "address": "Calle Mayor 1, Madrid",
                  "description": "Best coffee in town",
                  "email": "hello@example.com",
                  "website": [
                    "https://example.com"
                  ],
                  "category": "Food & Beverage"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/privacy": {
      "get": {
        "tags": [
          "Profile"
        ],
        "summary": "Get privacy settings",
        "description": "Returns the current privacy settings of the connected account as a map of category name to configured value.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Privacy settings map",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "string"
                  },
                  "example": {
                    "last": "contacts",
                    "online": "all",
                    "profile": "contacts",
                    "status": "contacts",
                    "readreceipts": "all",
                    "groupadd": "contacts"
                  }
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Update a privacy setting",
        "description": "Updates a single privacy category for the connected account.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "name",
                  "value"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "Privacy category: last, online, profile, status, readreceipts, groupadd, etc.",
                    "example": "last"
                  },
                  "value": {
                    "type": "string",
                    "description": "New value for the category (for example all, contacts, contact_blacklist, none).",
                    "example": "contacts"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Privacy setting updated",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  }
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/blocklist": {
      "get": {
        "tags": [
          "Profile"
        ],
        "summary": "Get the blocklist",
        "description": "Returns the list of JIDs currently blocked by the connected account.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Blocked JIDs",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "blocklist": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      },
                      "example": [
                        "34699888777@s.whatsapp.net"
                      ]
                    }
                  }
                },
                "example": {
                  "blocklist": [
                    "34699888777@s.whatsapp.net"
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/block": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Block a contact",
        "description": "Blocks the given JID for the connected account.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "jid"
                ],
                "properties": {
                  "jid": {
                    "type": "string",
                    "description": "JID of the contact to block.",
                    "example": "34699888777@s.whatsapp.net"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Contact blocked",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "jid": {
                      "type": "string",
                      "example": "34699888777@s.whatsapp.net"
                    },
                    "action": {
                      "type": "string",
                      "example": "block"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "jid": "34699888777@s.whatsapp.net",
                  "action": "block"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/unblock": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Unblock a contact",
        "description": "Unblocks the given JID for the connected account.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "jid"
                ],
                "properties": {
                  "jid": {
                    "type": "string",
                    "description": "JID of the contact to unblock.",
                    "example": "34699888777@s.whatsapp.net"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Contact unblocked",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "jid": {
                      "type": "string",
                      "example": "34699888777@s.whatsapp.net"
                    },
                    "action": {
                      "type": "string",
                      "example": "unblock"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "jid": "34699888777@s.whatsapp.net",
                  "action": "unblock"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/status": {
      "post": {
        "tags": [
          "Profile"
        ],
        "summary": "Post a text status update (story)",
        "description": "Publishes a text status/story to the given list of recipient JIDs. Optional font and ARGB color fields produce a styled status; if none are provided a plain text status is sent.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "text",
                  "statusJidList"
                ],
                "properties": {
                  "text": {
                    "type": "string",
                    "description": "The status text. Defaults to an empty string if omitted.",
                    "example": "Hello from wapi!"
                  },
                  "statusJidList": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Recipient JIDs that will receive the status update.",
                    "example": [
                      "34600123456@s.whatsapp.net",
                      "34699888777@s.whatsapp.net"
                    ]
                  },
                  "font": {
                    "type": "integer",
                    "description": "Optional font id for a styled status.",
                    "example": 2
                  },
                  "backgroundArgb": {
                    "type": "integer",
                    "description": "Optional background color as a 32-bit ARGB integer.",
                    "example": 4288585374
                  },
                  "textArgb": {
                    "type": "integer",
                    "description": "Optional text color as a 32-bit ARGB integer.",
                    "example": 4294967295
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Status posted; returns the underlying send result (for example the message id).",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "example": "3EB0XXXXXXXXXXXXXXXX"
                    }
                  },
                  "additionalProperties": true
                },
                "example": {
                  "id": "3EB0XXXXXXXXXXXXXXXX"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/newsletters": {
      "post": {
        "tags": [
          "Newsletters"
        ],
        "summary": "Create a newsletter (channel)",
        "description": "Creates a new WhatsApp newsletter/channel with the given name and optional description via the w:mex GraphQL API. Returns the created newsletter object spread alongside an ok flag.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "name"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "Display name of the newsletter.",
                    "example": "My Channel"
                  },
                  "description": {
                    "type": "string",
                    "description": "Optional description of the newsletter.",
                    "example": "News and updates"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Newsletter created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  },
                  "additionalProperties": true
                },
                "example": {
                  "ok": true,
                  "id": "123456789012345678@newsletter",
                  "thread_metadata": {
                    "name": {
                      "text": "My Channel"
                    },
                    "description": {
                      "text": "News and updates"
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "fallo"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/newsletters/{gid}/follow": {
      "post": {
        "tags": [
          "Newsletters"
        ],
        "summary": "Follow a newsletter",
        "description": "Subscribes the connected account to the newsletter identified by its JID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Newsletter JID.",
            "example": "123456789012345678@newsletter"
          }
        ],
        "responses": {
          "200": {
            "description": "Followed",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  },
                  "additionalProperties": true
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/newsletters/{gid}/unfollow": {
      "post": {
        "tags": [
          "Newsletters"
        ],
        "summary": "Unfollow a newsletter",
        "description": "Unsubscribes the connected account from the newsletter identified by its JID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Newsletter JID.",
            "example": "123456789012345678@newsletter"
          }
        ],
        "responses": {
          "200": {
            "description": "Unfollowed",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  },
                  "additionalProperties": true
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/newsletters/{gid}/messages": {
      "post": {
        "tags": [
          "Newsletters"
        ],
        "summary": "Send a text message to a newsletter",
        "description": "Publishes a plaintext message (no end-to-end encryption) to the newsletter identified by its JID. Returns the generated message id and target JID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Newsletter JID.",
            "example": "123456789012345678@newsletter"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "text"
                ],
                "properties": {
                  "text": {
                    "type": "string",
                    "description": "Message text to publish.",
                    "example": "Hello subscribers!"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message published",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    },
                    "id": {
                      "type": "string",
                      "example": "3EB0XXXXXXXXXXXXXXXX"
                    },
                    "to": {
                      "type": "string",
                      "example": "123456789012345678@newsletter"
                    }
                  }
                },
                "example": {
                  "ok": true,
                  "id": "3EB0XXXXXXXXXXXXXXXX",
                  "to": "123456789012345678@newsletter"
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/newsletters/{gid}/mute": {
      "post": {
        "tags": [
          "Newsletters"
        ],
        "summary": "Mute or unmute a newsletter",
        "description": "Mutes or unmutes the newsletter identified by its JID. The mute flag defaults to true; pass false to unmute.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Newsletter JID.",
            "example": "123456789012345678@newsletter"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "mute": {
                    "type": "boolean",
                    "description": "Whether to mute (true, default) or unmute (false). Only an explicit false unmutes.",
                    "example": true
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Mute state updated",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  },
                  "additionalProperties": true
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/newsletters/{gid}": {
      "get": {
        "tags": [
          "Newsletters"
        ],
        "summary": "Get newsletter metadata",
        "description": "Fetches metadata for the newsletter identified by its JID, including creation time, image and viewer metadata.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "gid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Newsletter JID.",
            "example": "123456789012345678@newsletter"
          }
        ],
        "responses": {
          "200": {
            "description": "Newsletter metadata object",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                },
                "example": {
                  "id": "123456789012345678@newsletter",
                  "thread_metadata": {
                    "name": {
                      "text": "My Channel"
                    },
                    "description": {
                      "text": "News and updates"
                    },
                    "subscribers_count": "42",
                    "creation_time": "1718800000"
                  },
                  "viewer_metadata": {
                    "mute": "OFF",
                    "role": "OWNER"
                  }
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Session not connected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_conectada"
                    },
                    "status": {
                      "type": "string",
                      "example": "connecting"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "fallo"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/calls": {
      "get": {
        "tags": [
          "Calls"
        ],
        "summary": "List detected calls",
        "description": "Returns the call events observed by the session. The engine only detects incoming calls (the 'call' event); audio is not supported. The list holds up to the 100 most recent events, newest first.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Detected call events",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "calls": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "string",
                            "example": "CALL12345"
                          },
                          "from": {
                            "type": "string",
                            "example": "34600123456@s.whatsapp.net"
                          },
                          "at": {
                            "type": "string",
                            "format": "date-time",
                            "example": "2026-06-20T10:00:00.000Z"
                          },
                          "type": {
                            "type": "string",
                            "example": "offer"
                          },
                          "raw": {
                            "type": "object",
                            "additionalProperties": true
                          }
                        }
                      }
                    }
                  }
                },
                "example": {
                  "calls": [
                    {
                      "id": "CALL12345",
                      "from": "34600123456@s.whatsapp.net",
                      "at": "2026-06-20T10:00:00.000Z",
                      "type": "offer",
                      "raw": {
                        "call-id": "CALL12345"
                      }
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sessions/{id}/calls/{callId}/reject": {
      "post": {
        "tags": [
          "Calls"
        ],
        "summary": "Reject an incoming call",
        "description": "Rejects a previously detected incoming call by its call id. The call must still be present in the session's call list.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "callId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Id of the detected call to reject.",
            "example": "CALL12345"
          }
        ],
        "responses": {
          "200": {
            "description": "Call rejected",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean",
                      "example": true
                    }
                  }
                },
                "example": {
                  "ok": true
                }
              }
            }
          },
          "404": {
            "description": "Session id unknown",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_existe"
                    }
                  }
                }
              }
            }
          },
          "501": {
            "description": "Could not reject the call (call not found or not yet implemented)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "no_implementado_aun"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Self-contained API explorer (no Swagger UI, no third-party CDN beyond fonts).
// Reads /openapi.json live and renders it with a dark + WhatsApp-green theme.
// The embedded JS avoids backticks and template placeholders because this whole
// string is itself a template literal.
export const swaggerHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>wapi · API</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0F172A; --surface:#131C2E; --surface-2:#1A2438; --muted:#1F2A40;
    --border:#2A3650; --border-soft:#222D44;
    --fg:#F1F5F9; --fg-dim:#94A3B8; --fg-faint:#64748B;
    --accent:#22C55E; --accent-press:#16A34A; --accent-soft:rgba(34,197,94,.12);
    --get:#38BDF8; --post:#22C55E; --del:#EF4444; --put:#F59E0B;
    --danger:#EF4444; --radius:12px; --radius-sm:8px;
    --sans:'IBM Plex Sans',system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace;
    --shadow:0 8px 30px rgba(0,0,0,.35);
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none}
  button{font-family:inherit;cursor:pointer}
  ::selection{background:var(--accent-soft)}
  /* Layout */
  .app{display:grid;grid-template-columns:300px 1fr;grid-template-rows:auto 1fr;height:100vh;min-height:0}
  header{grid-column:1/3;display:flex;align-items:center;gap:16px;padding:0 20px;height:60px;
    background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:20}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}
  .brand .logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(145deg,var(--accent),#0e8a43);
    display:grid;place-items:center;box-shadow:0 0 0 1px rgba(255,255,255,.06) inset}
  .brand small{display:block;font-weight:500;font-size:11px;color:var(--fg-dim);letter-spacing:.04em;text-transform:uppercase}
  .spacer{flex:1}
  .status{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--fg-dim);
    background:var(--muted);padding:6px 11px;border-radius:999px;border:1px solid var(--border-soft)}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--fg-faint);transition:background .3s}
  .dot.on{background:var(--accent);box-shadow:0 0 8px var(--accent)}
  .dot.off{background:var(--danger)}
  .key{display:flex;align-items:center;gap:6px;background:var(--muted);border:1px solid var(--border-soft);
    border-radius:var(--radius-sm);padding:0 10px;height:36px}
  .key input{background:none;border:0;color:var(--fg);font-family:var(--mono);font-size:12px;outline:none;width:150px}
  .key label{font-size:11px;color:var(--fg-faint);text-transform:uppercase;letter-spacing:.05em}
  .ghost{background:var(--muted);border:1px solid var(--border-soft);color:var(--fg-dim);
    border-radius:var(--radius-sm);height:36px;padding:0 13px;font-size:13px;transition:.15s}
  .ghost:hover{color:var(--fg);border-color:var(--border)}
  /* Sidebar */
  aside{background:var(--surface);border-right:1px solid var(--border);overflow-y:auto;padding:14px}
  .search{width:100%;background:var(--muted);border:1px solid var(--border-soft);border-radius:var(--radius-sm);
    color:var(--fg);padding:9px 12px;font-size:13px;outline:none;margin-bottom:14px;transition:.15s}
  .search:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .group{margin-bottom:6px}
  .group-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-faint);
    padding:10px 8px 6px}
  .ep{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--radius-sm);cursor:pointer;
    transition:background .12s;border:1px solid transparent}
  .ep:hover{background:var(--surface-2)}
  .ep.active{background:var(--accent-soft);border-color:rgba(34,197,94,.25)}
  .ep .path{font-family:var(--mono);font-size:12.5px;color:var(--fg-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ep.active .path{color:var(--fg)}
  .verb{font-family:var(--mono);font-size:10px;font-weight:600;padding:3px 6px;border-radius:5px;min-width:48px;text-align:center;flex-shrink:0}
  .verb.GET{color:var(--get);background:rgba(56,189,248,.12)}
  .verb.POST{color:var(--post);background:var(--accent-soft)}
  .verb.DELETE{color:var(--del);background:rgba(239,68,68,.12)}
  .verb.PUT,.verb.PATCH{color:var(--put);background:rgba(245,158,11,.12)}
  /* Main */
  main{overflow-y:auto;padding:32px 36px;min-width:0}
  .wrap{max-width:860px;margin:0 auto}
  .empty{display:grid;place-items:center;height:100%;color:var(--fg-faint);text-align:center}
  .empty svg{opacity:.4;margin-bottom:14px}
  .route{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}
  .route .verb{font-size:12px;padding:5px 10px;min-width:0}
  .route .url{font-family:var(--mono);font-size:16px;font-weight:500;color:var(--fg);word-break:break-all}
  h1{font-size:20px;margin:0 0 4px;letter-spacing:-.01em}
  .summary{color:var(--fg-dim);margin:0 0 24px;font-size:15px}
  .card{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius);padding:18px 20px;margin-bottom:18px}
  .card h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--fg-faint);margin:0 0 14px;font-weight:600}
  .field{margin-bottom:13px}
  .field:last-child{margin-bottom:0}
  .field label{display:block;font-size:12.5px;color:var(--fg-dim);margin-bottom:5px}
  .field label .req{color:var(--danger);margin-left:3px}
  .field label .loc{font-family:var(--mono);font-size:10px;color:var(--fg-faint);background:var(--muted);padding:1px 5px;border-radius:4px;margin-left:6px}
  .field input,.field textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);
    color:var(--fg);padding:9px 12px;font-family:var(--mono);font-size:13px;outline:none;transition:.15s}
  .field input:focus,.field textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  textarea{resize:vertical;min-height:120px;line-height:1.5}
  .send{background:var(--accent);color:#062611;border:0;border-radius:var(--radius-sm);font-weight:600;font-size:14px;
    padding:11px 22px;display:inline-flex;align-items:center;gap:8px;transition:.15s}
  .send:hover{background:var(--accent-press)}
  .send:active{transform:translateY(1px)}
  .send:disabled{opacity:.5;cursor:not-allowed}
  .resp-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .pill{font-family:var(--mono);font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px}
  .pill.ok{color:var(--accent);background:var(--accent-soft)}
  .pill.err{color:var(--danger);background:rgba(239,68,68,.12)}
  .ms{font-family:var(--mono);font-size:12px;color:var(--fg-faint)}
  pre{background:var(--bg);border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:16px;margin:0;
    overflow:auto;font-family:var(--mono);font-size:12.5px;line-height:1.6;max-height:420px}
  .menu-btn{display:none;background:var(--muted);border:1px solid var(--border-soft);color:var(--fg);
    width:36px;height:36px;border-radius:var(--radius-sm);place-items:center}
  @media (max-width:860px){
    .app{grid-template-columns:1fr}
    aside{position:fixed;top:60px;bottom:0;left:0;width:288px;z-index:30;transform:translateX(-100%);transition:transform .25s ease;box-shadow:var(--shadow)}
    aside.open{transform:none}
    .menu-btn{display:grid}
    .key{display:none}
    main{padding:22px 18px}
  }
  @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<div class="app">
  <header>
    <button class="menu-btn" id="menuBtn" aria-label="Open menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
    <div class="brand">
      <span class="logo">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#062611"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20z"/><path d="M9 7c.3 0 .5.2.7.6l.6 1.4c.1.3 0 .5-.1.7l-.5.6c-.1.1-.1.3 0 .5a6 6 0 0 0 2.7 2.6c.2.1.4.1.5 0l.6-.6c.2-.2.4-.2.7-.1l1.4.6c.3.1.5.4.5.7 0 1-.8 1.8-1.8 1.8A7.5 7.5 0 0 1 7.2 8.8C7.2 7.8 8 7 9 7z"/></svg>
      </span>
      <div>wapi<small>WhatsApp API</small></div>
    </div>
    <div class="spacer"></div>
    <div class="status"><span class="dot" id="dot"></span><span id="statusTxt">checking…</span></div>
    <div class="key"><label for="apiKey">key</label><input id="apiKey" placeholder="x-api-key (optional)" autocomplete="off" spellcheck="false"></div>
    <a class="ghost" href="/openapi.json" target="_blank" rel="noopener">OpenAPI</a>
  </header>
  <aside id="aside">
    <input class="search" id="search" placeholder="Search endpoints…" aria-label="Search endpoints">
    <nav id="nav"></nav>
  </aside>
  <main>
    <div class="wrap" id="content">
      <div class="empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
        <div>Select an endpoint to get started</div>
      </div>
    </div>
  </main>
</div>
<script>
(function(){
  var spec=null, current=null;
  var nav=document.getElementById('nav'), content=document.getElementById('content');
  var aside=document.getElementById('aside');
  document.getElementById('menuBtn').onclick=function(){aside.classList.toggle('open')};

  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function groupOf(p){if(p.indexOf('/communities')>=0)return 'Communities';if(p.indexOf('/newsletters')>=0)return 'Newsletters';if(p.indexOf('/groups')>=0)return 'Groups';if(p.indexOf('/media')>=0)return 'Media & Rich Messages';if(p.indexOf('/calls')>=0)return 'Calls';if(p.indexOf('/chats')>=0||p.indexOf('/presence')>=0)return 'Chats';if(p.indexOf('/messages')>=0||p.indexOf('/read')>=0||p.indexOf('/reactions')>=0)return 'Messaging';if(p.indexOf('/blocklist')>=0||p.indexOf('/privacy')>=0||p.indexOf('/profile')>=0||p.indexOf('/block')>=0||p.indexOf('/status')>=0)return 'Profile';if(p.indexOf('/sessions')>=0)return 'Sessions';return 'General';}
  var GROUPS=['Sessions','Messaging','Media & Rich Messages','Chats','Groups','Communities','Profile','Newsletters','Calls','General'];

  function exampleFor(op){
    try{
      var sch=op.requestBody.content['application/json'].schema;
      var o={}; var props=sch.properties||{};
      Object.keys(props).forEach(function(k){
        var p=props[k];
        o[k]=p.example!==undefined?p.example:(p.type==='object'?{}:p.type==='boolean'?false:p.type==='integer'?0:'');
      });
      return JSON.stringify(o,null,2);
    }catch(e){return ''}
  }

  function pathParams(p){var m=p.match(/\\{([^}]+)\\}/g)||[];return m.map(function(x){return x.slice(1,-1)})}

  function render(){
    var q=(document.getElementById('search').value||'').toLowerCase();
    var byGroup={};
    Object.keys(spec.paths).forEach(function(path){
      Object.keys(spec.paths[path]).forEach(function(m){
        var op=spec.paths[path][m];
        var label=m.toUpperCase()+' '+path;
        if(q && label.toLowerCase().indexOf(q)<0 && (op.summary||'').toLowerCase().indexOf(q)<0)return;
        var g=(op.tags&&op.tags[0])||groupOf(path);(byGroup[g]=byGroup[g]||[]).push({path:path,method:m.toUpperCase(),op:op});
      });
    });
    nav.innerHTML='';
    GROUPS.forEach(function(g){
      if(!byGroup[g])return;
      var div=document.createElement('div');div.className='group';
      div.innerHTML='<div class="group-title">'+g+'</div>';
      byGroup[g].forEach(function(e){
        var id=e.method+' '+e.path;
        var el=document.createElement('div');
        el.className='ep'+(current===id?' active':'');
        el.innerHTML='<span class="verb '+e.method+'">'+e.method+'</span><span class="path">'+esc(e.path)+'</span>';
        el.onclick=function(){current=id;aside.classList.remove('open');render();detail(e)};
        div.appendChild(el);
      });
      nav.appendChild(div);
    });
  }

  function detail(e){
    var op=e.op, pp=pathParams(e.path), hasBody=['POST','PUT','PATCH'].indexOf(e.method)>=0 && op.requestBody;
    var qp=(op.parameters||[]).filter(function(p){return p.in==='query'});
    var h='<div class="route"><span class="verb '+e.method+'">'+e.method+'</span><span class="url">'+esc(e.path)+'</span></div>';
    h+='<h1>'+esc(op.summary||e.path)+'</h1>';
    if(op.description)h+='<p class="summary">'+esc(op.description)+'</p>';
    if(pp.length||qp.length){
      h+='<div class="card"><h2>Parameters</h2>';
      pp.forEach(function(n){h+='<div class="field"><label>'+esc(n)+'<span class="req">*</span><span class="loc">path</span></label><input data-pp="'+esc(n)+'" placeholder="'+esc(n)+'"></div>'});
      qp.forEach(function(p){h+='<div class="field"><label>'+esc(p.name)+'<span class="loc">query</span></label><input data-qp="'+esc(p.name)+'" placeholder="'+esc(p.name)+'"></div>'});
      h+='</div>';
    }
    if(hasBody){
      h+='<div class="card"><h2>Body (JSON)</h2><div class="field"><textarea id="body" spellcheck="false">'+esc(exampleFor(op))+'</textarea></div></div>';
    }
    h+='<button class="send" id="send"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>Send request</button>';
    h+='<div id="resp" style="margin-top:22px"></div>';
    content.innerHTML='<div>'+h+'</div>';
    document.getElementById('send').onclick=function(){send(e)};
  }

  function send(e){
    var btn=document.getElementById('send');btn.disabled=true;
    var url=e.path;
    document.querySelectorAll('[data-pp]').forEach(function(i){url=url.replace('{'+i.getAttribute('data-pp')+'}',encodeURIComponent(i.value||''))});
    var qs=[];document.querySelectorAll('[data-qp]').forEach(function(i){if(i.value)qs.push(encodeURIComponent(i.getAttribute('data-qp'))+'='+encodeURIComponent(i.value))});
    if(qs.length)url+='?'+qs.join('&');
    var opt={method:e.method,headers:{}};
    var k=document.getElementById('apiKey').value;if(k)opt.headers['x-api-key']=k;
    var bodyEl=document.getElementById('body');
    if(bodyEl&&bodyEl.value.trim()){opt.headers['content-type']='application/json';opt.body=bodyEl.value}
    var t0=performance.now();
    fetch(url,opt).then(function(r){
      return r.text().then(function(txt){
        var ms=Math.round(performance.now()-t0);
        var pretty=txt;try{pretty=JSON.stringify(JSON.parse(txt),null,2)}catch(e){}
        var cls=r.ok?'ok':'err';
        document.getElementById('resp').innerHTML=
          '<div class="card"><div class="resp-head"><span class="pill '+cls+'">'+r.status+' '+esc(r.statusText)+'</span><span class="ms">'+ms+' ms</span><span class="ms">'+esc(e.method)+' '+esc(url)+'</span></div><pre>'+esc(pretty)+'</pre></div>';
      });
    }).catch(function(err){
      document.getElementById('resp').innerHTML='<div class="card"><span class="pill err">network error</span><pre>'+esc(String(err))+'</pre></div>';
    }).finally(function(){btn.disabled=false});
  }

  function ping(){
    fetch('/health').then(function(r){return r.json()}).then(function(){
      document.getElementById('dot').className='dot on';document.getElementById('statusTxt').textContent='online';
    }).catch(function(){document.getElementById('dot').className='dot off';document.getElementById('statusTxt').textContent='offline'});
  }

  document.getElementById('search').addEventListener('input',render);
  fetch('/openapi.json').then(function(r){return r.json()}).then(function(s){spec=s;render()});
  ping();setInterval(ping,15000);
})();
</script>
</body>
</html>`;
