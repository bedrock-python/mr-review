"""Test file to validate new review workflow features."""


def calculate_sum(a, b):
    """Calculate sum of two numbers.

    Args:
        a: First number
        b: Second number

    Returns:
        Sum of a and b
    """
    # TODO: Add input validation
    result = a + b
    return result


def divide_numbers(x, y):
    """Divide two numbers.

    This function has potential issues that should be caught in review.
    """
    # Missing error handling for division by zero
    return x / y


class UserManager:
    """Manages user operations."""

    def createUser(self, userName, userEmail):  # Wrong naming convention
        """Create a new user.

        Issues to catch:
        - Method name should be snake_case
        - Parameters should be snake_case
        - Missing type hints
        - No return type annotation
        """
        user_data = {
            "name": userName,
            "email": userEmail
        }
        return user_data
