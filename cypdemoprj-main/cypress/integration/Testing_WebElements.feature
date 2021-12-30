Feature: To test various scenarios on the home page of the website under test

@smoke @regression
Scenario: To check valid user can able to login to the application
	Given I go to the home page
	And I verify if the valid user name "krishnansiva07@gmail.com" and password is "Siva1234%" working


	@smoke @regression
    Scenario: To check valid user can able to login to the application
	Given I go to the home page
	And I verify if the valid user name "krishnansiva07@12.com" and password is "Siva1234%" working
