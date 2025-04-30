import requests
import sys
import json
import uuid
from datetime import datetime

class CashXAPITester:
    def __init__(self, base_url="https://dc42fcdb-ab12-44d3-bc36-a47e03e2390e.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user = None
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, form_data=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if form_data:
                    # For form data, we need to remove the Content-Type header
                    headers.pop('Content-Type', None)
                    response = requests.post(url, data=form_data, headers=headers)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json().get('detail', 'No detail provided')
                    print(f"Error detail: {error_detail}")
                except:
                    print(f"Response text: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        return self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )

    def test_register(self, name, email, password):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={"name": name, "email": email, "password": password}
        )
        return success, response

    def test_login(self, email, password):
        """Test login and get token"""
        form_data = {
            "username": email,
            "password": password
        }
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/token",
            200,
            form_data=form_data
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user = response.get('user')
            return True, response
        return False, response

    def test_get_current_user(self):
        """Test getting the current user profile"""
        return self.run_test(
            "Get Current User",
            "GET",
            "users/me",
            200
        )

    def test_get_products(self):
        """Test getting all products"""
        return self.run_test(
            "Get Products",
            "GET",
            "products",
            200
        )

    def test_get_product_by_id(self, product_id):
        """Test getting a product by ID"""
        return self.run_test(
            "Get Product by ID",
            "GET",
            f"products/{product_id}",
            200
        )

    def test_seed_products(self):
        """Test seeding products"""
        return self.run_test(
            "Seed Products",
            "POST",
            "seed/products",
            200
        )

    def test_create_transaction(self, product_id, amount):
        """Test creating a transaction"""
        data = {
            "product_id": product_id,
            "amount": amount,
            "verification_method": "self_reported"
        }
        return self.run_test(
            "Create Transaction",
            "POST",
            "transactions",
            200,
            data=data
        )

    def test_get_transactions(self):
        """Test getting user transactions"""
        return self.run_test(
            "Get User Transactions",
            "GET",
            "transactions",
            200
        )
        
    def test_create_bank_account(self):
        """Test creating a bank account"""
        data = {
            "account_holder": "Test User",
            "account_number": f"ACC{uuid.uuid4().hex[:8]}",
            "ifsc_code": "TEST0001",
            "bank_name": "Test Bank",
            "is_default": True
        }
        return self.run_test(
            "Create Bank Account",
            "POST",
            "bank-accounts",
            200,
            data=data
        )
        
    def test_get_bank_accounts(self):
        """Test getting user bank accounts"""
        return self.run_test(
            "Get Bank Accounts",
            "GET",
            "bank-accounts",
            200
        )
        
    def test_create_redemption_request(self, bank_account_id, amount=100.0):
        """Test creating a redemption request"""
        data = {
            "amount": amount,
            "method": "bank_transfer",
            "bank_account_id": bank_account_id
        }
        return self.run_test(
            "Create Redemption Request",
            "POST",
            "redemptions",
            200,
            data=data
        )
        
    def test_get_redemption_requests(self):
        """Test getting user redemption requests"""
        return self.run_test(
            "Get Redemption Requests",
            "GET",
            "redemptions",
            200
        )

def main():
    # Setup
    tester = CashXAPITester()
    test_user_email = f"test_user_{datetime.now().strftime('%H%M%S')}@example.com"
    test_user_name = f"Test User {datetime.now().strftime('%H%M%S')}"
    test_password = "TestPass123!"
    
    print(f"Starting CashX API tests at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API URL: {tester.api_url}")
    
    # Test root endpoint
    tester.test_root_endpoint()
    
    # Test user registration
    reg_success, reg_response = tester.test_register(test_user_name, test_user_email, test_password)
    if not reg_success:
        print("❌ Registration failed, stopping tests")
        return 1
    
    # Test login
    login_success, login_response = tester.test_login(test_user_email, test_password)
    if not login_success:
        print("❌ Login failed, stopping tests")
        return 1
    
    # Test getting current user
    user_success, user_response = tester.test_get_current_user()
    if not user_success:
        print("❌ Getting user profile failed")
    
    # Test seeding products (if needed)
    seed_success, seed_response = tester.test_seed_products()
    
    # Test getting products
    products_success, products_response = tester.test_get_products()
    if not products_success:
        print("❌ Getting products failed")
    else:
        print(f"Found {len(products_response)} products")
        
        # If we have products, test getting a specific product
        if products_response and len(products_response) > 0:
            product_id = products_response[0]['id']
            product_success, product_response = tester.test_get_product_by_id(product_id)
            
            # Test creating a transaction
            if product_success:
                transaction_success, transaction_response = tester.test_create_transaction(
                    product_id, 
                    products_response[0]['price']
                )
                
                # Test getting transactions
                if transaction_success:
                    tester.test_get_transactions()
    
    # Test bank account creation and redemption
    bank_success, bank_response = tester.test_create_bank_account()
    if bank_success:
        print(f"Created bank account: {bank_response.get('id')}")
        
        # Test getting bank accounts
        accounts_success, accounts_response = tester.test_get_bank_accounts()
        if accounts_success and accounts_response and len(accounts_response) > 0:
            bank_account_id = accounts_response[0]['id']
            
            # Test creating a redemption request
            redemption_success, redemption_response = tester.test_create_redemption_request(
                bank_account_id, 
                amount=50.0  # Small amount for testing
            )
            
            # Test getting redemption requests
            if redemption_success:
                tester.test_get_redemption_requests()
    
    # Print results
    print(f"\n📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())