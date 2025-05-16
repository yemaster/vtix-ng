import requests

def add_user(username, password):
    url = 'http://localhost:8080/auth/register'
    headers = {
        'origin': 'http://localhost:3000',
    }
    data = {
        'username': username,
        'password': password
    }
    response = requests.post(url, json=data, headers=headers)
    return response.json()

print(add_user('testpp', 'Njsn2uy7UBuU'))