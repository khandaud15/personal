from fastapi import FastAPI, APIRouter, HTTPException, Depends, Body, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional, Dict, Any, Union
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from enum import Enum
import json
from urllib.parse import urljoin

# Project setup
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="CashX API", description="Backend for CashX Cashback Rewards App")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Constants
SECRET_KEY = os.environ.get("SECRET_KEY", "cashx_default_secret_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# Enums
class TransactionStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"

class VerificationMethod(str, Enum):
    WEBHOOK = "webhook"
    MANUAL = "manual"
    SELF_REPORTED = "self_reported"

class RedemptionMethod(str, Enum):
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"

class RedemptionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

# Models
class UserBase(BaseModel):
    email: EmailStr
    name: str
    
class UserCreate(UserBase):
    password: str
    
    @validator('password')
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v

class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    cashback_balance: float = 0.0
    
    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class BankAccount(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    account_holder: str
    account_number: str
    ifsc_code: str
    bank_name: str
    is_default: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UPIDetails(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    upi_id: str
    is_default: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    price: float
    image_url: str
    amazon_url: str
    category: str
    cashback_percent: float
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    product_id: str
    amazon_order_id: Optional[str] = None
    amount: float
    cashback_amount: float
    status: TransactionStatus = TransactionStatus.PENDING
    verification_method: Optional[VerificationMethod] = None
    verified_at: Optional[datetime] = None
    verification_notes: Optional[str] = None
    screenshot_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TransactionCreate(BaseModel):
    product_id: str
    amazon_order_id: Optional[str] = None
    amount: float
    verification_method: VerificationMethod = VerificationMethod.SELF_REPORTED
    screenshot_url: Optional[str] = None

class RedemptionRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: float
    method: RedemptionMethod
    status: RedemptionStatus = RedemptionStatus.PENDING
    bank_account_id: Optional[str] = None
    upi_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None

class RedemptionRequestCreate(BaseModel):
    amount: float
    method: RedemptionMethod
    bank_account_id: Optional[str] = None
    upi_id: Optional[str] = None

# Security Functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_user_by_email(email: str):
    user = await db.users.find_one({"email": email})
    return user

async def authenticate_user(email: str, password: str):
    user = await get_user_by_email(email)
    if not user:
        return False
    if not verify_password(password, user["password"]):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Remove password from user data
    user.pop("password", None)
    
    return User(**user)

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Welcome to CashX API"}

# Authentication endpoints
@api_router.post("/auth/register", response_model=User)
async def register_user(user: UserCreate):
    # Check if user already exists
    existing_user = await get_user_by_email(user.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    new_user = User(
        email=user.email,
        name=user.name
    )
    new_user_dict = new_user.dict()
    new_user_dict["password"] = get_password_hash(user.password)
    
    # Save to database
    await db.users.insert_one(new_user_dict)
    
    # Don't return password
    new_user_dict.pop("password", None)
    
    return new_user

@api_router.post("/auth/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_obj = User(**{k: v for k, v in user.items() if k != "password"})
    access_token = create_access_token(data={"sub": user["id"]})
    
    return {"access_token": access_token, "user": user_obj}

@api_router.get("/users/me", response_model=User)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

# Product endpoints
@api_router.get("/products", response_model=List[Product])
async def get_products(category: Optional[str] = None, limit: int = 20, skip: int = 0):
    query = {}
    if category:
        query["category"] = category
        
    products = await db.products.find(query).skip(skip).limit(limit).to_list(limit)
    return [Product(**product) for product in products]

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product)

# For demo purposes, let's add a function to seed some products
@api_router.post("/seed/products", response_model=List[Product])
async def seed_products():
    # Clear existing products
    await db.products.delete_many({})
    
    # Sample products
    products = [
        {
            "title": "Amazon Echo Dot (5th Gen)",
            "description": "Smart speaker with Alexa",
            "price": 49.99,
            "image_url": "https://m.media-amazon.com/images/I/71JB6hM6Z6L._AC_SL1000_.jpg",
            "amazon_url": "https://www.amazon.com/dp/B09B8V1LZ3",
            "category": "Electronics",
            "cashback_percent": 5.0
        },
        {
            "title": "Apple AirPods Pro (2nd Gen)",
            "description": "Wireless earbuds with noise cancellation",
            "price": 249.99,
            "image_url": "https://m.media-amazon.com/images/I/61f1YfTkTDL._AC_SL1500_.jpg",
            "amazon_url": "https://www.amazon.com/dp/B0BDHB9Y8D",
            "category": "Electronics",
            "cashback_percent": 3.5
        },
        {
            "title": "Kindle Paperwhite",
            "description": "E-reader with adjustable warm light",
            "price": 139.99,
            "image_url": "https://m.media-amazon.com/images/I/61PJuQdRVqL._AC_SL1500_.jpg",
            "amazon_url": "https://www.amazon.com/dp/B08KTZ8249",
            "category": "Electronics",
            "cashback_percent": 4.0
        },
        {
            "title": "Samsung 55-Inch QLED 4K TV",
            "description": "Quantum HDR Smart TV with Alexa Built-in",
            "price": 897.99,
            "image_url": "https://m.media-amazon.com/images/I/71LJJrKbezL._AC_SL1500_.jpg",
            "amazon_url": "https://www.amazon.com/dp/B094C627M5",
            "category": "Electronics",
            "cashback_percent": 2.0
        },
        {
            "title": "Instant Pot Duo Plus 9-in-1",
            "description": "Electric Pressure Cooker, Slow Cooker, Rice Cooker, and More",
            "price": 129.95,
            "image_url": "https://m.media-amazon.com/images/I/71Nw6CjweIL._AC_SL1500_.jpg",
            "amazon_url": "https://www.amazon.com/dp/B06Y1MP2PY",
            "category": "Home & Kitchen",
            "cashback_percent": 6.0
        },
        {
            "title": "Fitbit Charge 5",
            "description": "Advanced Fitness & Health Tracker",
            "price": 149.95,
            "image_url": "https://m.media-amazon.com/images/I/61hzuoXwjqL._AC_SL1500_.jpg",
            "amazon_url": "https://www.amazon.com/dp/B09BXQ4QVM",
            "category": "Sports & Outdoors",
            "cashback_percent": 5.5
        }
    ]
    
    product_objects = []
    for product_data in products:
        product = Product(
            id=str(uuid.uuid4()),
            **product_data
        )
        product_objects.append(product)
        await db.products.insert_one(product.dict())
    
    return product_objects

# Transaction endpoints
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(
    transaction: TransactionCreate,
    current_user: User = Depends(get_current_user)
):
    # Get product details
    product = await db.products.find_one({"id": transaction.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Calculate cashback
    cashback_amount = (transaction.amount * product["cashback_percent"]) / 100
    
    # Create transaction
    new_transaction = Transaction(
        user_id=current_user.id,
        product_id=transaction.product_id,
        amazon_order_id=transaction.amazon_order_id,
        amount=transaction.amount,
        cashback_amount=cashback_amount,
        verification_method=transaction.verification_method,
        screenshot_url=transaction.screenshot_url
    )
    
    # Save to database
    await db.transactions.insert_one(new_transaction.dict())
    
    return new_transaction

@api_router.get("/transactions", response_model=List[Transaction])
async def get_user_transactions(current_user: User = Depends(get_current_user)):
    transactions = await db.transactions.find({"user_id": current_user.id}).to_list(100)
    return [Transaction(**t) for t in transactions]

# Bank account endpoints
@api_router.post("/bank-accounts", response_model=BankAccount)
async def add_bank_account(
    bank_account: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    # If this is set as default, unset any existing defaults
    if bank_account.get("is_default", True):
        await db.bank_accounts.update_many(
            {"user_id": current_user.id},
            {"$set": {"is_default": False}}
        )
    
    # Create new bank account
    new_bank_account = BankAccount(
        user_id=current_user.id,
        account_holder=bank_account["account_holder"],
        account_number=bank_account["account_number"],
        ifsc_code=bank_account["ifsc_code"],
        bank_name=bank_account["bank_name"],
        is_default=bank_account.get("is_default", True)
    )
    
    # Save to database
    await db.bank_accounts.insert_one(new_bank_account.dict())
    
    return new_bank_account

@api_router.get("/bank-accounts", response_model=List[BankAccount])
async def get_bank_accounts(current_user: User = Depends(get_current_user)):
    accounts = await db.bank_accounts.find({"user_id": current_user.id}).to_list(10)
    return [BankAccount(**account) for account in accounts]

# UPI endpoints
@api_router.post("/upi", response_model=UPIDetails)
async def add_upi(
    upi_details: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    # If this is set as default, unset any existing defaults
    if upi_details.get("is_default", True):
        await db.upi_details.update_many(
            {"user_id": current_user.id},
            {"$set": {"is_default": False}}
        )
    
    # Create new UPI details
    new_upi = UPIDetails(
        user_id=current_user.id,
        upi_id=upi_details["upi_id"],
        is_default=upi_details.get("is_default", True)
    )
    
    # Save to database
    await db.upi_details.insert_one(new_upi.dict())
    
    return new_upi

@api_router.get("/upi", response_model=List[UPIDetails])
async def get_upi_details(current_user: User = Depends(get_current_user)):
    upi_details = await db.upi_details.find({"user_id": current_user.id}).to_list(10)
    return [UPIDetails(**upi) for upi in upi_details]

# Redemption endpoints
@api_router.post("/redemptions", response_model=RedemptionRequest)
async def create_redemption_request(
    redemption: RedemptionRequestCreate,
    current_user: User = Depends(get_current_user)
):
    # Check if user has enough balance
    if current_user.cashback_balance < redemption.amount:
        raise HTTPException(status_code=400, detail="Insufficient cashback balance")
    
    # Validate redemption method details
    if redemption.method == RedemptionMethod.BANK_TRANSFER and not redemption.bank_account_id:
        raise HTTPException(status_code=400, detail="Bank account ID is required for bank transfers")
    
    if redemption.method == RedemptionMethod.UPI and not redemption.upi_id:
        raise HTTPException(status_code=400, detail="UPI ID is required for UPI transfers")
    
    # Create redemption request
    new_redemption = RedemptionRequest(
        user_id=current_user.id,
        amount=redemption.amount,
        method=redemption.method,
        bank_account_id=redemption.bank_account_id,
        upi_id=redemption.upi_id
    )
    
    # Update user balance
    await db.users.update_one(
        {"id": current_user.id},
        {"$inc": {"cashback_balance": -redemption.amount}}
    )
    
    # Save redemption request
    await db.redemption_requests.insert_one(new_redemption.dict())
    
    return new_redemption

@api_router.get("/redemptions", response_model=List[RedemptionRequest])
async def get_redemption_requests(current_user: User = Depends(get_current_user)):
    redemptions = await db.redemption_requests.find({"user_id": current_user.id}).to_list(100)
    return [RedemptionRequest(**r) for r in redemptions]

# Webhook endpoint for affiliate callbacks
@api_router.post("/webhooks/amazon-associates")
async def amazon_associates_webhook(payload: Dict[str, Any] = Body(...)):
    # This is a placeholder for the Amazon Associates webhook
    # In a real implementation, you would validate the webhook signature
    # and process the data accordingly
    
    # For demo purposes, let's just log the payload
    logging.info(f"Received webhook from Amazon Associates: {json.dumps(payload)}")
    
    # Extract order details from payload (this would depend on actual Amazon webhook format)
    # This is just a placeholder
    order_id = payload.get("amazon_order_id")
    if not order_id:
        raise HTTPException(status_code=400, detail="Missing order ID")
    
    # Find related transaction by order ID
    transaction = await db.transactions.find_one({"amazon_order_id": order_id})
    if not transaction:
        logging.warning(f"No transaction found for order ID: {order_id}")
        return {"status": "No matching transaction found"}
    
    # Update transaction status
    await db.transactions.update_one(
        {"amazon_order_id": order_id},
        {
            "$set": {
                "status": TransactionStatus.VERIFIED,
                "verification_method": VerificationMethod.WEBHOOK,
                "verified_at": datetime.utcnow()
            }
        }
    )
    
    # Update user's cashback balance
    await db.users.update_one(
        {"id": transaction["user_id"]},
        {"$inc": {"cashback_balance": transaction["cashback_amount"]}}
    )
    
    return {"status": "success", "transaction_id": transaction["id"]}

# Admin verification endpoint
@api_router.put("/admin/transactions/{transaction_id}/verify")
async def admin_verify_transaction(
    transaction_id: str,
    status: TransactionStatus,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # In a real app, we would check if the current user is an admin
    # For this demo, we'll skip that check
    
    # Find transaction
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Update transaction
    update_data = {
        "status": status,
        "verification_method": VerificationMethod.MANUAL,
        "verification_notes": notes,
        "verified_at": datetime.utcnow()
    }
    
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": update_data}
    )
    
    # If verified, update user's cashback balance
    if status == TransactionStatus.VERIFIED:
        await db.users.update_one(
            {"id": transaction["user_id"]},
            {"$inc": {"cashback_balance": transaction["cashback_amount"]}}
        )
    
    return {"status": "success"}

# Include the router in the main app
app.include_router(api_router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
