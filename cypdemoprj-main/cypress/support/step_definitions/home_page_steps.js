import { Given, When, Then } from 'cypress-cucumber-preprocessor/steps';

import HomePage  from  '../../pages/home_page.js';		//TODO :: if we give { HomePage } it fails.

import { home_page_locators } from '../../variables/locators.js';

Given('I go to the home page', () => {
	let home_page = new HomePage()
	home_page.goToHomePage()
});

Given('I verify if the valid user name {string} and password is {string} working', (userName,password) => {
	const home_page = new HomePage();
	home_page.performLogin(userName,password)
});






